"""GET /tasks/{id}/scales: владелец, чужой на публичной задаче, чужой на приватной, аноним.
ОХРАННЫЕ (зелёные и до патча): поведение уже есть, теста на маршрут не было."""
import pytest

from tests.conftest import create_test_user
from tests.test_lab_signal import _login
from tests.test_calibration_residue import _mk


async def _as(client, username):
    client.cookies.clear()
    client.headers.pop("Authorization", None)
    await _login(client, username)


async def _anon(client):
    client.cookies.clear()
    client.headers.pop("Authorization", None)


async def _setup(client, task_visibility):
    owner = await create_test_user("sr_owner"); other = await create_test_user("sr_other")
    t = await _mk("task", owner.id, "sr-t", visibility=task_visibility)
    hp = await _mk("hypothesis", owner.id, "sr-hp", visibility="public")
    hv = await _mk("hypothesis", owner.id, "sr-hv", visibility="private")
    await _as(client, owner.username)
    r = await client.post(f"/api/v1/tasks/{t}/scales",
                         json={"name": "Шкала-sr", "min_val": 0, "max_val": 10, "hypothesis_ids": [hp, hv]})
    assert r.status_code == 201, r.text
    return owner, other, t, hp, hv


@pytest.mark.asyncio
async def test_owner_sees_all_linked_hypotheses(client):
    _, _, t, hp, hv = await _setup(client, "public")
    r = await client.get(f"/api/v1/tasks/{t}/scales")
    assert r.status_code == 200, r.text
    assert sorted(r.json()[0]["hypothesis_ids"]) == sorted([hp, hv])


@pytest.mark.asyncio
async def test_stranger_on_public_task_gets_no_private_hypothesis_id(client):
    _, other, t, hp, hv = await _setup(client, "public")
    await _as(client, other.username)
    r = await client.get(f"/api/v1/tasks/{t}/scales")
    assert r.status_code == 200, r.text
    assert r.json()[0]["hypothesis_ids"] == [hp]


@pytest.mark.asyncio
async def test_stranger_on_private_task_gets_no_scales(client):
    _, other, t, _, _ = await _setup(client, "private")
    await _as(client, other.username)
    r = await client.get(f"/api/v1/tasks/{t}/scales")
    assert r.status_code in (403, 404), r.text
    assert "Шкала-sr" not in r.text


@pytest.mark.asyncio
async def test_anonymous_gets_401(client):
    _, _, t, _, _ = await _setup(client, "public")
    await _anon(client)
    r = await client.get(f"/api/v1/tasks/{t}/scales")
    assert r.status_code in (401, 403), r.text
