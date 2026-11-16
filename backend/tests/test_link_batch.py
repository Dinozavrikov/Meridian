"""Пакетные операции со связями: всё или ничего, общий batch_id у событий, атомарный откат пакета."""
import pytest
from sqlalchemy import select, update

from tests.conftest import create_test_user
from app.core.prediction_status import CLOSED_PREDICTION_STATUSES
from app.db.session import AsyncSessionLocal
from app.models.entities import Event, Prediction


async def _login(client, username, password="pass12345"):
    r = await client.post("/api/v1/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200


async def _obs(client):
    r = await client.post("/api/v1/observations/", json={"title": "Т", "date": "2026-09-23", "author": "a", "text": "x",
                                                         "lab_id": None, "visibility": "private", "tags": []})
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def _hyp(client, visibility="private"):
    r = await client.post("/api/v1/hypotheses/", json={"name": "Гипотеза", "description": "d", "date_created": "2026-08-06",
                                                       "status": "идея", "visibility": visibility})
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


async def _pred(client, hyp_id=None):
    r = await client.post("/api/v1/predictions/", json={"title": "п", "text": "т", "date_created": "2026-08-06",
        "expected_check_date": "2026-12-06T00:00:00", "status": "не проверен", "visibility": "private",
        "confidence": 50, "hypothesis_id": hyp_id})
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


async def _link(client, a_type, a_id, b_type, b_id, lt="связано"):
    r = await client.post(f"/api/v1/graph/links?from_type={a_type}&from_id={a_id}&to_type={b_type}&to_id={b_id}&link_type={lt}")
    assert r.status_code == 200, r.text


async def _types(client, root_type, root_id):
    rel = (await client.get(f"/api/v1/graph/related/{root_type}/{root_id}")).json()["related"]
    return {(i["type"], i["id"]): (i["stance"] if i["source"] == "field" else i["link_type"])
            for items in rel.values() for i in items if i["direct"]}


def _op(op, t, i, source, link_type=None):
    d = {"op": op, "other_type": t, "other_id": i, "source": source}
    if link_type:
        d["link_type"] = link_type
    return d


async def _batch(client, root_type, root_id, ops):
    return await client.post(f"/api/v1/{root_type}/{root_id}/links/batch", json={"ops": ops})


async def _events(batch_id):
    async with AsyncSessionLocal() as db:
        return (await db.execute(select(Event).where(Event.meta["batch_id"].astext == batch_id))).scalars().all()


@pytest.mark.asyncio
async def test_set_type_changes_all_and_events_share_batch_id(client):
    await create_test_user("bt_a"); await _login(client, "bt_a")
    h, o1, o2 = await _hyp(client), await _obs(client), await _obs(client)
    await _link(client, "observation", o1, "hypothesis", h); await _link(client, "observation", o2, "hypothesis", h)
    r = await _batch(client, "hypothesis", h, [_op("set_type", "observation", o1, "link", "опровергает"),
                                               _op("set_type", "observation", o2, "link", "подтверждает")])
    assert r.status_code == 200, r.text
    assert r.json()["applied"] == 2
    t = await _types(client, "hypothesis", h)
    assert t[("observation", o1)] == "опровергает" and t[("observation", o2)] == "подтверждает"
    evs = await _events(r.json()["batch_id"])
    assert len(evs) == 2 and {e.type for e in evs} == {"link_type_changed"}


@pytest.mark.asyncio
async def test_one_bad_op_rejects_everything_with_reasons(client):
    await create_test_user("bt_b"); await _login(client, "bt_b")
    h, o1, o2 = await _hyp(client), await _obs(client), await _obs(client)
    await _link(client, "observation", o1, "hypothesis", h)
    r = await _batch(client, "hypothesis", h, [_op("set_type", "observation", o1, "link", "опровергает"),
                                               _op("remove", "observation", o2, "link")])   # o2 не связана
    assert r.status_code == 409, r.text
    errs = r.json()["detail"]["errors"]
    assert [e["index"] for e in errs] == [1]
    assert (await _types(client, "hypothesis", h))[("observation", o1)] == "связано"   # первая операция не применилась
    async with AsyncSessionLocal() as db:
        n = len((await db.execute(select(Event).where(Event.type == "link_type_changed"))).scalars().all())
    assert n == 0


@pytest.mark.asyncio
async def test_foreign_link_cannot_be_changed_in_batch(client):
    await create_test_user("bt_c"); await create_test_user("bt_d")
    await _login(client, "bt_c")
    h, o = await _hyp(client, "public"), await _obs(client)
    await _link(client, "observation", o, "hypothesis", h)
    await _login(client, "bt_d")
    r = await _batch(client, "hypothesis", h, [_op("set_type", "observation", o, "link", "опровергает")])
    assert r.status_code == 409
    await _login(client, "bt_c")
    assert (await _types(client, "hypothesis", h))[("observation", o)] == "связано"


@pytest.mark.asyncio
async def test_remove_both_sources_then_undo_batch_restores_all(client):
    await create_test_user("bt_e"); await _login(client, "bt_e")
    h, o = await _hyp(client), await _obs(client)
    p = await _pred(client, h)
    await _link(client, "observation", o, "prediction", p, "подтверждает")
    r = await _batch(client, "prediction", p, [_op("remove", "observation", o, "link"), _op("remove", "hypothesis", h, "field")])
    assert r.status_code == 200, r.text
    assert await _types(client, "prediction", p) == {}
    bid = r.json()["batch_id"]
    u = await client.post(f"/api/v1/prediction/{p}/undo/batch/{bid}")
    assert u.status_code == 200, u.text
    t = await _types(client, "prediction", p)
    assert t[("observation", o)] == "подтверждает" and ("hypothesis", h) in t
    again = await client.post(f"/api/v1/prediction/{p}/undo/batch/{bid}")
    assert again.status_code == 409   # уже откатан


@pytest.mark.asyncio
async def test_undo_of_unknown_batch_is_404(client):
    await create_test_user("bt_f"); await _login(client, "bt_f")
    h = await _hyp(client)
    r = await client.post(f"/api/v1/hypothesis/{h}/undo/batch/nope")
    assert r.status_code == 404
    assert r.json()["detail"]["code"] == "batch_not_found"   # ответ нашего обработчика, а не «маршрута нет»


@pytest.mark.asyncio
async def test_field_link_stance_and_closed_prediction_blocked(client):
    await create_test_user("bt_g"); await _login(client, "bt_g")
    h = await _hyp(client); p = await _pred(client, h)
    r = await _batch(client, "prediction", p, [_op("set_type", "hypothesis", h, "field", "опровергает")])
    assert r.status_code == 200, r.text
    assert (await _types(client, "prediction", p))[("hypothesis", h)] == "опровергает"
    async with AsyncSessionLocal() as db:
        await db.execute(update(Prediction).where(Prediction.id == p).values(status=sorted(CLOSED_PREDICTION_STATUSES)[0]))
        await db.commit()
    r = await _batch(client, "prediction", p, [_op("set_type", "hypothesis", h, "field", "подтверждает")])
    assert r.status_code == 409
    assert (await _types(client, "prediction", p))[("hypothesis", h)] == "опровергает"


@pytest.mark.asyncio
async def test_field_op_must_match_the_actual_hypothesis_and_type(client):
    await create_test_user("bt_h"); await _login(client, "bt_h")
    h1, h2 = await _hyp(client), await _hyp(client)
    p = await _pred(client, h1)
    assert (await _batch(client, "prediction", p, [_op("remove", "hypothesis", h2, "field")])).status_code == 409
    assert (await _batch(client, "prediction", p, [_op("set_type", "hypothesis", h1, "field", "связано")])).status_code == 409
    assert ("hypothesis", h1) in await _types(client, "prediction", p)


@pytest.mark.asyncio
async def test_duplicates_and_size_limits(client):
    await create_test_user("bt_i"); await _login(client, "bt_i")
    h, o = await _hyp(client), await _obs(client)
    await _link(client, "observation", o, "hypothesis", h)
    dup = [_op("set_type", "observation", o, "link", "опровергает")] * 2
    assert (await _batch(client, "hypothesis", h, dup)).status_code == 409
    assert (await _batch(client, "hypothesis", h, [])).status_code == 422
    assert (await _batch(client, "hypothesis", h, [_op("remove", "observation", i + 1, "link") for i in range(51)])).status_code == 422


@pytest.mark.asyncio
async def test_link_history_exposes_batch_id_and_marks_reverted(client):
    await create_test_user("bt_j"); await _login(client, "bt_j")
    h, o1, o2, o3 = await _hyp(client), await _obs(client), await _obs(client), await _obs(client)
    for o in (o1, o2, o3):
        await _link(client, "observation", o, "hypothesis", h)
    r = await _batch(client, "hypothesis", h, [_op("remove", "observation", o1, "link"), _op("remove", "observation", o2, "link")])
    assert r.status_code == 200, r.text
    bid = r.json()["batch_id"]
    hist = (await client.get(f"/api/v1/hypothesis/{h}/link-history")).json()
    unlinked = [e for e in hist if e["type"] == "unlinked"]
    assert len(unlinked) == 2 and {e["batch_id"] for e in unlinked} == {bid}
    assert all(e["batch_id"] is None for e in hist if e["type"] == "linked")   # одиночные события без пакета
    assert (await client.post(f"/api/v1/hypothesis/{h}/undo/batch/{bid}")).status_code == 200
    after = (await client.get(f"/api/v1/hypothesis/{h}/link-history")).json()
    assert all(e["reverted"] for e in after if e["type"] == "unlinked")
    assert all(e["batch_id"] is None for e in after if e["reverts_event_id"] is not None)   # откат сам в пакет не входит


@pytest.mark.asyncio
async def test_link_history_window_never_cuts_a_batch(client):
    await create_test_user("bt_win"); await _login(client, "bt_win")
    h, o1, o2, o3 = await _hyp(client), await _obs(client), await _obs(client), await _obs(client)
    for o in (o1, o2):
        await _link(client, "observation", o, "hypothesis", h)
    r = await _batch(client, "hypothesis", h, [_op("remove", "observation", o1, "link"), _op("remove", "observation", o2, "link")])
    assert r.status_code == 200, r.text
    bid = r.json()["batch_id"]
    # окно в одно событие попадает внутрь пакета: отдаётся пакет целиком, по убыванию id
    hist = (await client.get(f"/api/v1/hypothesis/{h}/link-history?limit=1")).json()
    assert len(hist) == 2 and {e["batch_id"] for e in hist} == {bid}
    assert [e["id"] for e in hist] == sorted((e["id"] for e in hist), reverse=True)
    # окно, не задевающее пакет, ничего лишнего не тянет
    await _link(client, "observation", o3, "hypothesis", h)
    hist = (await client.get(f"/api/v1/hypothesis/{h}/link-history?limit=1")).json()
    assert len(hist) == 1 and hist[0]["type"] == "linked" and hist[0]["batch_id"] is None


async def _set_importance(oid, value):
    from app.models.entities import Observation
    async with AsyncSessionLocal() as db:
        await db.execute(update(Observation).where(Observation.id == oid).values(importance=value))
        await db.commit()


async def _total(h):
    from app.models.entities import Hypothesis
    from app.services.hypothesis_evidence import observation_signal
    async with AsyncSessionLocal() as db:
        hyp = await db.get(Hypothesis, h)
        return hyp.evidence_signal + await observation_signal(db, hyp.user_id, h)


async def _preview(client, root_type, root_id, ops):
    return await client.post(f"/api/v1/{root_type}/{root_id}/links/batch/preview", json={"ops": ops})


@pytest.mark.asyncio
async def test_preview_matches_real_result_and_writes_nothing(client):
    await create_test_user("bp_a"); await _login(client, "bp_a")
    h, o1, o2 = await _hyp(client), await _obs(client), await _obs(client)
    for o in (o1, o2):
        await _set_importance(o, 5)
        await _link(client, "observation", o, "hypothesis", h, "подтверждает")
    ops = [_op("set_type", "observation", o, "link", "опровергает") for o in (o1, o2)]
    r = await _preview(client, "hypothesis", h, ops)
    assert r.status_code == 200, r.text
    items = r.json()["hypotheses"]
    assert len(items) == 1 and items[0]["hypothesis_id"] == h
    assert items[0]["before"] == pytest.approx(0.6) and items[0]["after"] == pytest.approx(-0.6)
    # пробный запуск ничего не записал: типы прежние, событий смены нет
    types = await _types(client, "hypothesis", h)
    assert types[("observation", o1)] == types[("observation", o2)] == "подтверждает"
    async with AsyncSessionLocal() as db:
        evs = (await db.execute(select(Event).where(Event.type == "link_type_changed", Event.entity_type == "observation",
                                                    Event.entity_id.in_([o1, o2])))).scalars().all()
    assert evs == []
    assert await _total(h) == pytest.approx(items[0]["before"])
    # настоящий пакет даёт ровно то, что обещал пробный запуск
    assert (await _batch(client, "hypothesis", h, ops)).status_code == 200
    assert await _total(h) == pytest.approx(items[0]["after"])


@pytest.mark.asyncio
async def test_preview_noop_pending_prediction_and_rejection(client):
    await create_test_user("bp_b"); await _login(client, "bp_b")
    h, o1 = await _hyp(client), await _obs(client)
    await _set_importance(o1, 5)
    await _link(client, "observation", o1, "hypothesis", h, "подтверждает")
    # то же значение, что уже есть: сигнал не меняется, показывать нечего
    r = await _preview(client, "hypothesis", h, [_op("set_type", "observation", o1, "link", "подтверждает")])
    assert r.status_code == 200 and r.json() == {"hypotheses": [], "pending_predictions": 0}
    # открытый прогноз: сигнал не меняется сейчас, только при закрытии
    p = await _pred(client, h)
    r = await _preview(client, "hypothesis", h, [_op("set_type", "prediction", p, "field", "опровергает")])
    assert r.status_code == 200 and r.json() == {"hypotheses": [], "pending_predictions": 1}
    assert (await client.get(f"/api/v1/predictions/{p}")).json()["confirms_hypothesis_if_true"] is True
    # недопустимая операция: те же 409 с причинами, что у настоящего пакета, и ничего не записано
    r = await _preview(client, "hypothesis", h, [_op("set_type", "observation", o1, "link", "bogus")])
    assert r.status_code == 409 and r.json()["detail"]["code"] == "batch_rejected"
    assert (await _types(client, "hypothesis", h))[("observation", o1)] == "подтверждает"
