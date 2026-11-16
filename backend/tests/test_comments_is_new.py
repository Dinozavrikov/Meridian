"""GET /comments/{type}/{id} помечает чужие комментарии, созданные позже отметки просмотра, как is_new."""
import pytest

from tests.test_open_via_link import _login, _world


async def _setup(client):
    a, b, c, lab, r, n = await _world(client)          # залогинен ov_a, r — лабораторная запись
    await _login(client, "ov_b")
    resp = await client.post(f"/api/v1/comments/observation/{r}", json={"content": "от b"})
    assert resp.status_code == 200, resp.text
    await _login(client, "ov_a")
    return r


async def _flags(client, r):
    resp = await client.get(f"/api/v1/comments/observation/{r}")
    assert resp.status_code == 200, resp.text
    return [c.get("is_new") for c in resp.json()]


@pytest.mark.asyncio
async def test_foreign_comment_is_new_until_seen(client):
    r = await _setup(client)
    assert await _flags(client, r) == [True]                   # КРАСНЫЙ на старом коде: поля нет (None)
    assert (await client.post(f"/api/v1/comments/seen/observation/{r}")).status_code == 200
    assert await _flags(client, r) == [False]                  # после отметки просмотра не новый


@pytest.mark.asyncio
async def test_own_comment_is_never_new(client):
    """ОХРАННЫЙ (зелёный до патча): свой комментарий не считается новым."""
    r = await _setup(client)
    resp = await client.post(f"/api/v1/comments/observation/{r}", json={"content": "от a"})
    assert resp.status_code == 200, resp.text
    got = (await client.get(f"/api/v1/comments/observation/{r}")).json()
    mine = [c for c in got if c["content"] == "от a"]
    assert mine and not mine[0].get("is_new")
