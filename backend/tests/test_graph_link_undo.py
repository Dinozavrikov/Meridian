"""События связей и откат: удалить → откатить → строка в БД вернулась с прежним типом."""
from sqlalchemy import select

from app.db.session import AsyncSessionLocal
from app.models.entities import Event, Link
from tests.conftest import create_test_user


async def _login(client, username, password="pass12345"):
    r = await client.post("/api/v1/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200


async def _pair(client, link_type="подтверждает"):
    o = (await client.post("/api/v1/observations/", json={"title": "o", "date": "2026-09-23", "author": "a", "text": "b", "lab_id": None, "visibility": "private"})).json()["id"]
    h = (await client.post("/api/v1/hypotheses/", json={"name": "h", "description": "d", "date_created": "2026-08-06", "status": "идея", "visibility": "private"})).json()["id"]
    r = await client.post(f"/api/v1/graph/links?from_type=observation&from_id={o}&to_type=hypothesis&to_id={h}&link_type={link_type}")
    assert r.status_code == 200
    return o, h


async def _links():
    async with AsyncSessionLocal() as db:
        return (await db.execute(select(Link.link_type))).scalars().all()


async def _events(*types):
    async with AsyncSessionLocal() as db:
        return (await db.execute(select(Event).where(Event.type.in_(types)).order_by(Event.id))).scalars().all()


Q = "from_type=observation&from_id={o}&to_type=hypothesis&to_id={h}"


async def test_remove_writes_event_and_undo_restores_same_type(client):
    await create_test_user("lu_a")
    await _login(client, "lu_a")
    o, h = await _pair(client)
    r = await client.delete(f"/api/v1/graph/links?{Q.format(o=o, h=h)}")
    assert r.json()["removed"] == 1 and await _links() == []
    (ev,) = await _events("unlinked")
    assert ev.meta["link_type"] == "подтверждает"
    r = await client.post(f"/api/v1/observation/{o}/undo/{ev.id}")
    assert r.status_code == 200, r.text
    assert await _links() == ["подтверждает"]
    assert (await _events("linked"))[-1].meta["reverts_event_id"] == ev.id


async def test_type_change_writes_event_and_undo_restores_old_type(client):
    await create_test_user("lu_b")
    await _login(client, "lu_b")
    o, h = await _pair(client, "связано")
    r = await client.put(f"/api/v1/graph/links?{Q.format(o=o, h=h)}&link_type=опровергает")
    assert r.status_code == 200 and await _links() == ["опровергает"]
    (ev,) = await _events("link_type_changed")
    assert ev.meta["old"] == "связано" and ev.meta["new"] == "опровергает"
    r = await client.post(f"/api/v1/observation/{o}/undo/{ev.id}")
    assert r.status_code == 200, r.text
    assert await _links() == ["связано"]


async def test_undo_of_added_link_removes_it_and_can_be_redone(client):
    await create_test_user("lu_c")
    await _login(client, "lu_c")
    o, h = await _pair(client)
    (added,) = await _events("linked")
    assert (await client.post(f"/api/v1/observation/{o}/undo/{added.id}")).status_code == 200
    assert await _links() == []
    (back,) = await _events("unlinked")
    assert (await client.post(f"/api/v1/observation/{o}/undo/{back.id}")).status_code == 200
    assert await _links() == ["подтверждает"]


async def test_undo_blocked_when_link_was_restored_by_hand(client):
    await create_test_user("lu_d")
    await _login(client, "lu_d")
    o, h = await _pair(client)
    await client.delete(f"/api/v1/graph/links?{Q.format(o=o, h=h)}")
    (ev,) = await _events("unlinked")
    await client.post(f"/api/v1/graph/links?{Q.format(o=o, h=h)}&link_type=связано")
    r = await client.post(f"/api/v1/observation/{o}/undo/{ev.id}")
    assert r.status_code == 409 and r.json()["detail"]["code"] == "link_exists"
    assert await _links() == ["связано"]


async def test_undo_from_the_other_side_page(client):
    await create_test_user("lu_e")
    await _login(client, "lu_e")
    o, h = await _pair(client)
    await client.delete(f"/api/v1/graph/links?{Q.format(o=o, h=h)}")
    (ev,) = await _events("unlinked")
    assert (await client.post(f"/api/v1/hypothesis/{h}/undo/{ev.id}")).status_code == 200
    assert await _links() == ["подтверждает"]


async def test_stranger_cannot_undo(client):
    await create_test_user("lu_f")
    await create_test_user("lu_g")
    await _login(client, "lu_f")
    o, h = await _pair(client)
    await client.delete(f"/api/v1/graph/links?{Q.format(o=o, h=h)}")
    (ev,) = await _events("unlinked")
    await _login(client, "lu_g")
    assert (await client.post(f"/api/v1/observation/{o}/undo/{ev.id}")).status_code == 404
    assert await _links() == []


async def test_link_history_lists_events_with_verdict(client):
    await create_test_user("lu_h")
    await _login(client, "lu_h")
    o, h = await _pair(client)
    await client.delete(f"/api/v1/graph/links?{Q.format(o=o, h=h)}")
    r = await client.get(f"/api/v1/observation/{o}/link-history")
    assert r.status_code == 200, r.text
    items = r.json()
    top = items[0]
    assert top["type"] == "unlinked" and top["other_type"] == "hypothesis" and top["other_id"] == h
    assert top["other_title"] == "h" and top["link_type"] == "подтверждает" and top["undoable"] is True
    assert items[1]["type"] == "linked" and items[1]["undoable"] is False and items[1]["blocked_code"] == "link_missing"
    r = await client.get(f"/api/v1/hypothesis/{h}/link-history")
    assert r.json()[0]["other_type"] == "observation"
