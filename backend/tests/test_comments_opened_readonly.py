"""Запись, открытая участнику через связь, читается вместе с обсуждением, но комментировать её он не может."""
import pytest

from tests.test_open_via_link import _login, _world
from tests.test_publication_share import _post_link


async def _setup(client):
    a, b, c, lab, r, n = await _world(client)          # залогинен ov_a
    resp = await _post_link(client, n, r, share="lab")
    assert resp.status_code in (200, 201), resp.text
    return r, n


@pytest.mark.asyncio
async def test_member_cannot_comment_on_opened_record(client):
    r, n = await _setup(client)
    await _login(client, "ov_b")
    assert (await client.get(f"/api/v1/comments/observation/{n}")).status_code == 200      # читает
    resp = await client.post(f"/api/v1/comments/observation/{n}", json={"content": "x"})
    assert resp.status_code == 404, resp.text            # КРАСНЫЙ на старом коде: сейчас 200


@pytest.mark.asyncio
async def test_member_can_comment_on_lab_record(client):
    """ОХРАННЫЙ (зелёный до патча): лабораторная запись комментируется участником."""
    r, n = await _setup(client)
    await _login(client, "ov_b")
    resp = await client.post(f"/api/v1/comments/observation/{r}", json={"content": "x"})
    assert resp.status_code == 200, resp.text


@pytest.mark.asyncio
async def test_owner_can_comment_on_own_opened_record(client):
    """ОХРАННЫЙ (зелёный до патча)."""
    r, n = await _setup(client)
    resp = await client.post(f"/api/v1/comments/observation/{n}", json={"content": "x"})
    assert resp.status_code == 200, resp.text
