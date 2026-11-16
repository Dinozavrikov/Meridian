"""Роль и отношение конкурирующей гипотезы: одна ведущая, события, откат, права."""
from sqlalchemy import select

from app.db.session import AsyncSessionLocal
from app.models.entities import EntityHypothesis, Event
from tests.conftest import create_test_user


async def _login(client, username, password="pass12345"):
    r = await client.post("/api/v1/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200


async def _setup(client, n=2):
    q = (await client.post("/api/v1/questions/", json={"title": "q", "date_created": "2026-08-06", "status": "открыт", "visibility": "private"})).json()["id"]
    hs = []
    for i in range(n):
        h = (await client.post("/api/v1/hypotheses/", json={"name": f"h{i}", "description": "d", "date_created": "2026-08-06", "status": "идея", "visibility": "private"})).json()["id"]
        assert (await client.post(f"/api/v1/questions/{q}/hypotheses/{h}")).status_code == 204
        hs.append(h)
    return q, hs


async def _state():
    async with AsyncSessionLocal() as db:
        rows = (await db.execute(select(EntityHypothesis.hypothesis_id, EntityHypothesis.role, EntityHypothesis.stance))).all()
    return {h: (r, s) for h, r, s in rows}


async def _events(t):
    async with AsyncSessionLocal() as db:
        return (await db.execute(select(Event).where(Event.type == t).order_by(Event.id))).scalars().all()


def url(q, h):
    return f"/api/v1/competing/question/{q}/{h}"


async def test_defaults_and_related_exposes_role(client):
    await create_test_user("cr_a")
    await _login(client, "cr_a")
    q, (h1, h2) = await _setup(client)
    assert await _state() == {h1: ("alternative", "связано"), h2: ("alternative", "связано")}
    item = (await client.get(f"/api/v1/graph/related/question/{q}")).json()["related"]["hypothesis"][0]
    assert item["role"] == "alternative" and item["stance"] == "связано"


async def test_only_one_leading_and_undo_restores_previous(client):
    await create_test_user("cr_b")
    await _login(client, "cr_b")
    q, (h1, h2) = await _setup(client)
    assert (await client.put(url(q, h1), json={"role": "leading"})).status_code == 200
    assert (await client.put(url(q, h2), json={"role": "leading"})).status_code == 200
    st = await _state()
    assert st[h1][0] == "alternative" and st[h2][0] == "leading"
    ev = (await _events("competing_changed"))[-1]
    assert (await client.post(f"/api/v1/question/{q}/undo/{ev.id}")).status_code == 200
    st = await _state()
    assert st[h2][0] == "alternative" and st[h1][0] == "leading"
    back = (await _events("competing_changed"))[-1]  # redo: откат отката
    assert (await client.post(f"/api/v1/question/{q}/undo/{back.id}")).status_code == 200
    st = await _state()
    assert st[h2][0] == "leading" and st[h1][0] == "alternative"


async def test_stance_change_and_undo(client):
    await create_test_user("cr_c")
    await _login(client, "cr_c")
    q, (h1, _) = await _setup(client)
    assert (await client.put(url(q, h1), json={"stance": "опровергает"})).status_code == 200
    assert (await _state())[h1][1] == "опровергает"
    ev = (await _events("competing_changed"))[-1]
    assert ev.meta["field"] == "stance" and ev.meta["old"] == "связано" and ev.meta["new"] == "опровергает"
    assert (await client.post(f"/api/v1/question/{q}/undo/{ev.id}")).status_code == 200
    assert (await _state())[h1][1] == "связано"


async def test_undo_blocked_after_later_change(client):
    await create_test_user("cr_d")
    await _login(client, "cr_d")
    q, (h1, _) = await _setup(client)
    await client.put(url(q, h1), json={"role": "leading"})
    first = (await _events("competing_changed"))[-1]
    await client.put(url(q, h1), json={"role": "rejected"})
    r = await client.post(f"/api/v1/question/{q}/undo/{first.id}")
    assert r.status_code == 409 and r.json()["detail"]["code"] == "link_changed"
    assert (await _state())[h1][0] == "rejected"


async def test_unlink_and_undo_keep_role_and_stance(client):
    await create_test_user("cr_e")
    await _login(client, "cr_e")
    q, (h1, _) = await _setup(client)
    await client.put(url(q, h1), json={"role": "leading", "stance": "подтверждает"})
    await client.delete(f"/api/v1/questions/{q}/hypotheses/{h1}")
    ev = (await _events("competing_unlinked"))[-1]
    assert (await client.post(f"/api/v1/question/{q}/undo/{ev.id}")).status_code == 200
    assert (await _state())[h1] == ("leading", "подтверждает")


async def test_stranger_cannot_change(client):
    await create_test_user("cr_f")
    await create_test_user("cr_g")
    await _login(client, "cr_f")
    q, (h1, _) = await _setup(client)
    await _login(client, "cr_g")
    r = await client.put(url(q, h1), json={"role": "leading"})
    assert r.status_code in (403, 404)
    assert (await _state())[h1][0] == "alternative"


async def test_validation(client):
    await create_test_user("cr_h")
    await _login(client, "cr_h")
    q, (h1, _) = await _setup(client)
    assert (await client.put(url(q, h1), json={"role": "король"})).status_code == 422
    assert (await client.put(url(q, h1), json={})).status_code == 400
    assert (await client.put(f"/api/v1/competing/question/{q}/99999", json={"role": "leading"})).status_code == 404


async def test_history_lists_change(client):
    await create_test_user("cr_i")
    await _login(client, "cr_i")
    q, (h1, _) = await _setup(client)
    await client.put(url(q, h1), json={"role": "leading"})
    top = (await client.get(f"/api/v1/question/{q}/link-history")).json()[0]
    assert top["type"] == "competing_changed" and top["new"] == "leading" and top["undoable"] is True
