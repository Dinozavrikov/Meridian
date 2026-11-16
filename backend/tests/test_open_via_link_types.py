"""Запись, открытая через связь, для гипотез, вопросов и задач (наблюдения: test_open_via_link). R: лабораторное наблюдение."""
import pytest

from app.db.session import AsyncSessionLocal
from app.models.entities import Link
from tests.conftest import create_test_user
from tests.share_helpers import add_share
from tests.test_open_via_link import _login, _world

KINDS = {
    "hypothesis": ("/api/v1/hypotheses/", {"name": "N", "description": "d", "date_created": "2026-08-06", "status": "идея", "visibility": "private"}),
    "question":   ("/api/v1/questions/",  {"title": "N", "date_created": "2026-08-06", "visibility": "private"}),
    "task":       ("/api/v1/tasks/",      {"name": "N", "visibility": "private"}),
}


async def _mk(client, kind):
    url, body = KINDS[kind]
    r = await client.post(url, json=body)
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


async def _link(by_user_id, kind, n, r):
    async with AsyncSessionLocal() as db:
        db.add(Link(user_id=by_user_id, from_type=kind, from_id=n, to_type="observation", to_id=r, link_type="связано"))
        await db.commit()
    await add_share(kind, n, "observation", r, by_user_id)


async def _view(client, username, kind, n):
    await _login(client, username)
    url = KINDS[kind][0]
    listed = {o["id"] for o in (await client.get(url)).json()}
    return {"listed": n in listed, "direct": (await client.get(f"{url}{n}")).status_code}


def _closed(v):
    return not v["listed"] and v["direct"] != 200


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", list(KINDS))
async def test_member_sees_it_when_the_owner_linked_it(client, kind):
    a, b, c, lab, r, _ = await _world(client)
    await _login(client, "ov_a")
    n = await _mk(client, kind)
    assert (await _view(client, "ov_a", kind, n))["direct"] == 200    # контроль: путь верный, владелец открывает
    await _link(a.id, kind, n, r)
    assert (v := await _view(client, "ov_b", kind, n)) == {"listed": True, "direct": 200}, v


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", list(KINDS))
async def test_link_by_non_owner_opens_nothing(client, kind):
    a, b, c, lab, r, _ = await _world(client)
    await _login(client, "ov_a")
    n = await _mk(client, kind)
    await _link(b.id, kind, n, r)
    assert _closed(await _view(client, "ov_c", kind, n))


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", list(KINDS))
async def test_owner_outside_the_lab_opens_nothing(client, kind):
    a, b, c, lab, r, _ = await _world(client)
    x = await create_test_user("ov_x")
    await _login(client, "ov_x")
    n = await _mk(client, kind)
    await _link(x.id, kind, n, r)
    assert _closed(await _view(client, "ov_b", kind, n))


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", list(KINDS))
async def test_stranger_sees_nothing(client, kind):
    """ОХРАННЫЙ (зелёный и до патча)."""
    a, b, c, lab, r, _ = await _world(client)
    await _login(client, "ov_a")
    n = await _mk(client, kind)
    await _link(a.id, kind, n, r)
    assert _closed(await _view(client, "ov_s", kind, n))
