"""Закрытие доступа («Кому открыто») пишет приватное событие share_closed, и его можно откатить: согласие возвращается.
Откат проверяет, что условия ещё верны (связь жива, запись приватна), иначе 409 и ничего не создаётся."""
import pytest
from sqlalchemy import select

from app.db.session import AsyncSessionLocal
from app.models.entities import Event, RecordShare
from tests.test_open_via_link import _login, _world
from tests.test_publication_share import _count, _post_link
from tests.test_publication_share_paths import _status
from tests.test_publication_share_undo import _event_id


async def _closed(client):
    a, b, c, lab, r, n = await _world(client)
    assert (await _post_link(client, n, r, share="lab")).status_code == 200
    sid = (await client.get(f"/api/v1/observation/{n}/shares")).json()[0]["id"]
    assert (await client.delete(f"/api/v1/observation/{n}/shares/{sid}")).status_code == 200
    ev = await _event_id("share_closed")
    assert ev is not None, "close_share не записал событие share_closed"
    return lab, r, n, ev


@pytest.mark.asyncio
async def test_close_event_is_private_and_has_no_lab(client):
    """Факт закрытия не должен светиться в ленте лаборатории: видимость private, lab_id пуст."""
    lab, r, n, ev = await _closed(client)
    async with AsyncSessionLocal() as db:
        e = await db.get(Event, ev)
    assert e.visibility == "private" and e.lab_id is None, (e.visibility, e.lab_id)
    assert (e.entity_type, e.entity_id, e.related_type, e.related_id) == ("observation", n, "observation", r)


@pytest.mark.asyncio
async def test_undo_restores_share_and_member_access(client):
    lab, r, n, ev = await _closed(client)
    assert await _status(client, "ov_b", f"/api/v1/observations/{n}") != 200
    await _login(client, "ov_a")
    resp = await client.post(f"/api/v1/observation/{n}/undo/{ev}")
    assert resp.status_code == 200, resp.text
    assert await _count(RecordShare) == 1
    assert await _status(client, "ov_b", f"/api/v1/observations/{n}") == 200


@pytest.mark.asyncio
async def test_undo_twice_is_blocked(client):
    lab, r, n, ev = await _closed(client)
    assert (await client.post(f"/api/v1/observation/{n}/undo/{ev}")).status_code == 200
    assert (await client.post(f"/api/v1/observation/{n}/undo/{ev}")).status_code == 409
    assert await _count(RecordShare) == 1


@pytest.mark.asyncio
async def test_undo_blocked_when_link_was_deleted_after_close(client):
    lab, r, n, ev = await _closed(client)
    assert (await client.delete("/api/v1/graph/links", params={
        "from_type": "observation", "from_id": n, "to_type": "observation", "to_id": r})).status_code == 200
    resp = await client.post(f"/api/v1/observation/{n}/undo/{ev}")
    assert resp.status_code == 409, resp.text
    assert await _count(RecordShare) == 0


@pytest.mark.asyncio
async def test_undo_blocked_when_record_became_public(client):
    lab, r, n, ev = await _closed(client)
    assert (await client.put(f"/api/v1/observation/{n}/visibility", json={"visibility": "public"})).status_code == 200
    resp = await client.post(f"/api/v1/observation/{n}/undo/{ev}")
    assert resp.status_code == 409, resp.text
    assert await _count(RecordShare) == 0


@pytest.mark.asyncio
async def test_non_owner_cannot_undo_close(client):
    lab, r, n, ev = await _closed(client)
    await _login(client, "ov_b")
    assert (await client.post(f"/api/v1/observation/{n}/undo/{ev}")).status_code == 404
    assert await _count(RecordShare) == 0


@pytest.mark.asyncio
async def test_undo_writes_reverse_event_and_it_can_be_undone(client):
    """Обратное событие share_opened с reverts_event_id; его откат снова закрывает доступ."""
    lab, r, n, ev = await _closed(client)
    assert (await client.post(f"/api/v1/observation/{n}/undo/{ev}")).status_code == 200
    back = await _event_id("share_opened")
    assert back is not None
    async with AsyncSessionLocal() as db:
        e = await db.get(Event, back)
    assert (e.meta or {}).get("reverts_event_id") == ev and e.visibility == "private" and e.lab_id is None
    assert (await client.post(f"/api/v1/observation/{n}/undo/{back}")).status_code == 200
    assert await _count(RecordShare) == 0
