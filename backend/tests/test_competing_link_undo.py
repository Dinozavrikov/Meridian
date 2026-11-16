"""Конкурирующая гипотеза: отвязка пишет событие, откат возвращает строку, управление видно в related."""
from sqlalchemy import select

from app.db.session import AsyncSessionLocal
from app.models.entities import EntityHypothesis, Event
from tests.conftest import create_test_user


async def _login(client, username, password="pass12345"):
    r = await client.post("/api/v1/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200


async def _setup(client):
    q = (await client.post("/api/v1/questions/", json={"title": "q", "date_created": "2026-08-06", "status": "открыт", "visibility": "private"})).json()["id"]
    h = (await client.post("/api/v1/hypotheses/", json={"name": "h", "description": "d", "date_created": "2026-08-06", "status": "идея", "visibility": "private"})).json()["id"]
    r = await client.post(f"/api/v1/questions/{q}/hypotheses/{h}")
    assert r.status_code == 204, r.text
    return q, h


async def _rows():
    async with AsyncSessionLocal() as db:
        return (await db.execute(select(EntityHypothesis.hypothesis_id))).scalars().all()


async def _events(*types):
    async with AsyncSessionLocal() as db:
        return (await db.execute(select(Event).where(Event.type.in_(types)).order_by(Event.id))).scalars().all()


async def test_unlink_writes_event_and_undo_restores_row(client):
    await create_test_user("ch_a")
    await _login(client, "ch_a")
    q, h = await _setup(client)
    assert (await client.delete(f"/api/v1/questions/{q}/hypotheses/{h}")).status_code == 204
    assert await _rows() == []
    (ev,) = await _events("competing_unlinked")
    assert (ev.entity_type, ev.entity_id, ev.related_type, ev.related_id) == ("hypothesis", h, "question", q)
    assert (await client.post(f"/api/v1/question/{q}/undo/{ev.id}")).status_code == 200
    assert await _rows() == [h]
    assert (await _events("competing_hypothesis"))[-1].meta["reverts_event_id"] == ev.id


async def test_undo_of_add_removes_row_and_redo_restores(client):
    await create_test_user("ch_b")
    await _login(client, "ch_b")
    q, h = await _setup(client)
    (added,) = await _events("competing_hypothesis")
    assert (await client.post(f"/api/v1/hypothesis/{h}/undo/{added.id}")).status_code == 200
    assert await _rows() == []
    (back,) = await _events("competing_unlinked")
    assert (await client.post(f"/api/v1/hypothesis/{h}/undo/{back.id}")).status_code == 200
    assert await _rows() == [h]


async def test_undo_blocked_when_restored_by_hand(client):
    await create_test_user("ch_c")
    await _login(client, "ch_c")
    q, h = await _setup(client)
    await client.delete(f"/api/v1/questions/{q}/hypotheses/{h}")
    (ev,) = await _events("competing_unlinked")
    await client.post(f"/api/v1/questions/{q}/hypotheses/{h}")
    r = await client.post(f"/api/v1/question/{q}/undo/{ev.id}")
    assert r.status_code == 409 and r.json()["detail"]["code"] == "link_exists"


async def test_stranger_cannot_undo(client):
    await create_test_user("ch_d")
    await create_test_user("ch_e")
    await _login(client, "ch_d")
    q, h = await _setup(client)
    await client.delete(f"/api/v1/questions/{q}/hypotheses/{h}")
    (ev,) = await _events("competing_unlinked")
    await _login(client, "ch_e")
    assert (await client.post(f"/api/v1/question/{q}/undo/{ev.id}")).status_code == 404
    assert await _rows() == []


async def test_related_marks_competing_as_editable_for_parent_owner(client):
    await create_test_user("ch_f")
    await _login(client, "ch_f")
    q, h = await _setup(client)
    r = await client.get(f"/api/v1/graph/related/question/{q}")
    item = r.json()["related"]["hypothesis"][0]
    assert item["source"] == "competing" and item["direct"] is True and item["can_edit"] is True
    r = await client.get(f"/api/v1/graph/related/hypothesis/{h}")
    item = r.json()["related"]["question"][0]
    assert item["source"] == "competing" and item["can_edit"] is True


async def test_link_history_lists_competing_events(client):
    await create_test_user("ch_g")
    await _login(client, "ch_g")
    q, h = await _setup(client)
    await client.delete(f"/api/v1/questions/{q}/hypotheses/{h}")
    items = (await client.get(f"/api/v1/question/{q}/link-history")).json()
    assert [i["type"] for i in items][:2] == ["competing_unlinked", "competing_hypothesis"]
    assert items[0]["other_type"] == "hypothesis" and items[0]["other_id"] == h and items[0]["undoable"] is True
