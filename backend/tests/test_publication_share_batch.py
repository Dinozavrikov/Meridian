"""Пакетный откат удаления связей, возвращающий связь с лабораторной записью, спрашивает «кому видно» (share), как одиночный."""
import pytest

from app.models.entities import Link, RecordShare
from tests.test_open_via_link import _login, _world
from tests.test_publication_share import _count, _post_link
from tests.test_publication_share_paths import _status


async def _removed_batch(client):
    a, b, c, lab, r, n = await _world(client)
    assert (await _post_link(client, n, r, share="lab")).status_code == 200
    resp = await client.post(f"/api/v1/observation/{n}/links/batch", json={"ops": [
        {"op": "remove", "other_type": "observation", "other_id": r, "source": "link"}]})
    assert resp.status_code == 200, resp.text
    assert await _count(Link) == 0 and await _count(RecordShare) == 0
    return n, resp.json()["batch_id"]


@pytest.mark.asyncio
async def test_batch_undo_without_share_asks_and_changes_nothing(client):
    """ОХРАННЫЙ (зелёный и до патча): без выбора 409 и ни связи, ни согласия."""
    n, bid = await _removed_batch(client)
    resp = await client.post(f"/api/v1/observation/{n}/undo/batch/{bid}")
    assert resp.status_code == 409 and resp.json()["detail"]["code"] == "needs_consent", resp.text
    assert resp.json()["detail"]["impacts"][0]["options"] == ["me", "lab"]
    assert await _count(Link) == 0 and await _count(RecordShare) == 0


@pytest.mark.asyncio
async def test_batch_undo_share_lab_restores_link_and_access(client):
    n, bid = await _removed_batch(client)
    resp = await client.post(f"/api/v1/observation/{n}/undo/batch/{bid}", params={"share": "lab"})
    assert resp.status_code == 200, resp.text
    assert await _count(Link) == 1 and await _count(RecordShare) == 1
    assert await _status(client, "ov_b", f"/api/v1/observations/{n}") == 200


@pytest.mark.asyncio
async def test_batch_undo_share_me_restores_link_but_not_access(client):
    n, bid = await _removed_batch(client)
    resp = await client.post(f"/api/v1/observation/{n}/undo/batch/{bid}", params={"share": "me"})
    assert resp.status_code == 200, resp.text
    assert await _count(Link) == 1 and await _count(RecordShare) == 0
    assert await _status(client, "ov_b", f"/api/v1/observations/{n}") != 200


@pytest.mark.asyncio
async def test_batch_undo_share_public_rejected_for_closed_lab(client):
    n, bid = await _removed_batch(client)
    resp = await client.post(f"/api/v1/observation/{n}/undo/batch/{bid}", params={"share": "public"})
    assert resp.status_code == 400, resp.text
    assert await _count(Link) == 0 and await _count(RecordShare) == 0
