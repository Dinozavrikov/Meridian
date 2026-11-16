"""Выбор «кому видно» при связи, которая открывает запись лаборатории: share=me|lab|public вместо consent=true.
me: связь есть, запись никому не открыта. lab: чтение через связь (record_shares). Недопустимое для лаборатории значение: 400."""
import pytest
from sqlalchemy import func, select

from app.db.session import AsyncSessionLocal
from app.models.entities import Link, RecordShare
from tests.test_open_via_link import _login, _world


async def _post_link(client, n, r, **extra):
    return await client.post("/api/v1/graph/links", params={
        "from_type": "observation", "from_id": n, "to_type": "observation", "to_id": r, "link_type": "связано", **extra})


async def _count(model):
    async with AsyncSessionLocal() as db:
        return (await db.execute(select(func.count()).select_from(model))).scalar_one()


@pytest.mark.asyncio
async def test_409_lists_share_options_for_closed_lab(client):
    a, b, c, lab, r, n = await _world(client)
    resp = await _post_link(client, n, r)
    assert resp.status_code == 409, resp.text
    imp = resp.json()["detail"]["impacts"][0]
    assert imp["options"] == ["me", "lab"], imp          # закрытая лаборатория: «всем» не предлагаем


@pytest.mark.asyncio
async def test_share_me_links_but_opens_nothing(client):
    a, b, c, lab, r, n = await _world(client)
    resp = await _post_link(client, n, r, share="me")
    assert resp.status_code == 200, resp.text
    assert await _count(Link) == 1
    assert await _count(RecordShare) == 0
    await _login(client, "ov_b")
    assert (await client.get(f"/api/v1/observations/{n}")).status_code != 200   # участник по-прежнему не видит


@pytest.mark.asyncio
async def test_share_lab_opens_for_members(client):
    a, b, c, lab, r, n = await _world(client)
    resp = await _post_link(client, n, r, share="lab")
    assert resp.status_code == 200, resp.text
    assert await _count(RecordShare) == 1
    await _login(client, "ov_b")
    assert (await client.get(f"/api/v1/observations/{n}")).status_code == 200


@pytest.mark.asyncio
async def test_share_public_rejected_for_closed_lab(client):
    a, b, c, lab, r, n = await _world(client)
    resp = await _post_link(client, n, r, share="public")
    assert resp.status_code == 400, resp.text
    assert await _count(Link) == 0 and await _count(RecordShare) == 0


@pytest.mark.asyncio
async def test_unknown_share_value_is_422(client):
    a, b, c, lab, r, n = await _world(client)
    resp = await _post_link(client, n, r, share="everyone")
    assert resp.status_code == 422, resp.text
    assert await _count(Link) == 0
