"""Связь прогноз↔гипотеза (поле hypothesis_id): capabilities, смена типа, отвязка, события, откат."""
from sqlalchemy import select, update

from app.db.session import AsyncSessionLocal
from app.models.entities import Event, Prediction
from tests.conftest import create_test_user


async def _login(client, username, password="pass12345"):
    r = await client.post("/api/v1/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200


async def _setup(client):
    h = (await client.post("/api/v1/hypotheses/", json={"name": "h", "description": "d", "date_created": "2026-08-06", "status": "идея", "visibility": "private"})).json()["id"]
    p = await client.post("/api/v1/predictions/", json={"title": "p", "text": "will", "date_created": "2026-08-06", "expected_check_date": "2026-09-06T00:00:00", "hypothesis_id": h, "status": "не проверен", "visibility": "private"})
    assert p.status_code in (200, 201), p.text
    return p.json()["id"], h


async def _pred(pid):
    async with AsyncSessionLocal() as db:
        p = await db.get(Prediction, pid)
        return p.hypothesis_id, p.confirms_hypothesis_if_true


async def _events(*types):
    async with AsyncSessionLocal() as db:
        return (await db.execute(select(Event).where(Event.type.in_(types)).order_by(Event.id))).scalars().all()


async def _item(client, etype, eid, itype):
    rel = (await client.get(f"/api/v1/graph/related/{etype}/{eid}")).json()["related"]
    return rel[itype][0]


async def test_capabilities_and_stance_on_both_sides(client):
    await create_test_user("fl_a")
    await _login(client, "fl_a")
    p, h = await _setup(client)
    a = await _item(client, "prediction", p, "hypothesis")
    b = await _item(client, "hypothesis", h, "prediction")
    for it in (a, b):
        assert it["source"] == "field" and it["capabilities"] == ["remove", "set_type"] and it["stance"] == "подтверждает"


async def test_own_link_row_capabilities(client):
    await create_test_user("fl_b")
    await _login(client, "fl_b")
    _, h = await _setup(client)
    o = (await client.post("/api/v1/observations/", json={"title": "o", "date": "2026-09-23", "author": "a", "text": "b", "lab_id": None, "visibility": "private"})).json()["id"]
    await client.post(f"/api/v1/graph/links?from_type=observation&from_id={o}&to_type=hypothesis&to_id={h}&link_type=связано")
    assert (await _item(client, "hypothesis", h, "observation"))["capabilities"] == ["remove", "set_type"]


async def test_type_change_event_and_undo(client):
    await create_test_user("fl_c")
    await _login(client, "fl_c")
    p, h = await _setup(client)
    r = await client.put(f"/api/v1/field-link/prediction/{p}", json={"confirms": False})
    assert r.status_code == 200, r.text
    assert await _pred(p) == (h, False)
    assert (await _item(client, "prediction", p, "hypothesis"))["stance"] == "опровергает"
    (ev,) = await _events("field_link_changed")
    assert ev.meta["old"] == "подтверждает" and ev.meta["new"] == "опровергает"
    assert (await client.post(f"/api/v1/prediction/{p}/undo/{ev.id}")).status_code == 200
    assert await _pred(p) == (h, True)


async def test_unlink_and_undo_restores_link_and_type(client):
    await create_test_user("fl_d")
    await _login(client, "fl_d")
    p, h = await _setup(client)
    await client.put(f"/api/v1/field-link/prediction/{p}", json={"confirms": False})
    assert (await client.delete(f"/api/v1/field-link/prediction/{p}")).status_code == 200
    assert (await _pred(p))[0] is None
    (ev,) = await _events("field_unlinked")
    assert ev.entity_id == p and ev.related_id == h
    assert (await client.post(f"/api/v1/hypothesis/{h}/undo/{ev.id}")).status_code == 200   # со страницы гипотезы
    assert await _pred(p) == (h, False)
    (back,) = await _events("field_linked")
    assert (await client.post(f"/api/v1/prediction/{p}/undo/{back.id}")).status_code == 200  # откат отката
    assert (await _pred(p))[0] is None


async def test_undo_blocked_when_relinked_by_hand(client):
    await create_test_user("fl_e")
    await _login(client, "fl_e")
    p, h = await _setup(client)
    await client.delete(f"/api/v1/field-link/prediction/{p}")
    (ev,) = await _events("field_unlinked")
    async with AsyncSessionLocal() as db:
        await db.execute(update(Prediction).where(Prediction.id == p).values(hypothesis_id=h))
        await db.commit()
    r = await client.post(f"/api/v1/prediction/{p}/undo/{ev.id}")
    assert r.status_code == 409 and r.json()["detail"]["code"] == "link_exists"


async def test_closed_prediction_is_locked(client):
    await create_test_user("fl_f")
    await _login(client, "fl_f")
    p, h = await _setup(client)
    async with AsyncSessionLocal() as db:
        await db.execute(update(Prediction).where(Prediction.id == p).values(status="подтвердился"))
        await db.commit()
    assert (await client.put(f"/api/v1/field-link/prediction/{p}", json={"confirms": False})).status_code == 400
    assert (await client.delete(f"/api/v1/field-link/prediction/{p}")).status_code == 400
    it = await _item(client, "prediction", p, "hypothesis")
    assert it["capabilities"] == [] and it["stance"] == "подтверждает"
    assert await _pred(p) == (h, True)


async def test_stranger_cannot_change(client):
    await create_test_user("fl_g")
    await create_test_user("fl_h")
    await _login(client, "fl_g")
    p, h = await _setup(client)
    await _login(client, "fl_h")
    assert (await client.put(f"/api/v1/field-link/prediction/{p}", json={"confirms": False})).status_code == 404
    assert (await client.delete(f"/api/v1/field-link/prediction/{p}")).status_code == 404
    assert await _pred(p) == (h, True)


async def test_history_lists_field_events(client):
    await create_test_user("fl_i")
    await _login(client, "fl_i")
    p, h = await _setup(client)
    await client.put(f"/api/v1/field-link/prediction/{p}", json={"confirms": False})
    top = (await client.get(f"/api/v1/prediction/{p}/link-history")).json()[0]
    assert top["type"] == "field_link_changed" and top["other_type"] == "hypothesis" and top["other_id"] == h
    assert top["old"] == "подтверждает" and top["new"] == "опровергает" and top["undoable"] is True
    assert (await client.get(f"/api/v1/hypothesis/{h}/link-history")).json()[0]["other_type"] == "prediction"
