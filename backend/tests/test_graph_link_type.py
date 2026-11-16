"""PUT /graph/links: смена типа связи на месте, только автором связи."""
from sqlalchemy import select

from app.db.session import AsyncSessionLocal
from app.models.entities import Link
from tests.conftest import create_test_user


async def _login(client, username, password="pass12345"):
    r = await client.post("/api/v1/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200


async def _linked_pair(client):
    o = await client.post("/api/v1/observations/", json={"title": "t", "date": "2026-09-23", "author": "a", "text": "b", "lab_id": None, "visibility": "private"})
    h = await client.post("/api/v1/hypotheses/", json={"name": "h", "description": "d", "date_created": "2026-08-06", "status": "идея", "visibility": "private"})
    oid, hid = o.json()["id"], h.json()["id"]
    r = await client.post(f"/api/v1/graph/links?from_type=observation&from_id={oid}&to_type=hypothesis&to_id={hid}&link_type=связано")
    assert r.status_code == 200, r.text
    return oid, hid


async def _types():
    async with AsyncSessionLocal() as db:
        return (await db.execute(select(Link.link_type))).scalars().all()


async def test_author_changes_link_type_in_place(client):
    await create_test_user("lt_owner")
    await _login(client, "lt_owner")
    oid, hid = await _linked_pair(client)
    r = await client.put(f"/api/v1/graph/links?from_type=observation&from_id={oid}&to_type=hypothesis&to_id={hid}&link_type=подтверждает")
    assert r.status_code == 200, r.text
    assert await _types() == ["подтверждает"]


async def test_stranger_cannot_change_link_type(client):
    await create_test_user("lt_owner2")
    await create_test_user("lt_stranger")
    await _login(client, "lt_owner2")
    oid, hid = await _linked_pair(client)
    await _login(client, "lt_stranger")
    r = await client.put(f"/api/v1/graph/links?from_type=observation&from_id={oid}&to_type=hypothesis&to_id={hid}&link_type=опровергает")
    assert r.status_code == 404
    assert await _types() == ["связано"]


async def test_unknown_link_type_rejected(client):
    await create_test_user("lt_owner3")
    await _login(client, "lt_owner3")
    oid, hid = await _linked_pair(client)
    r = await client.put(f"/api/v1/graph/links?from_type=observation&from_id={oid}&to_type=hypothesis&to_id={hid}&link_type=мусор")
    assert r.status_code == 400
    assert await _types() == ["связано"]
