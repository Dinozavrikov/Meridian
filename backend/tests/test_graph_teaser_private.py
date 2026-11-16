"""Гостевой тизер графа не считает приватные связи."""
import pytest

from app.main import app
from tests.conftest import create_test_user
from tests.test_open_via_link import _login, _mk_obs
from tests.test_publication_share import _post_link


def _teaser_path():
    return next(r.path for r in app.routes if getattr(r, "name", None) == "public_graph_teaser")


async def _edges(client):
    resp = await client.get(_teaser_path())
    assert resp.status_code == 200, resp.text
    return resp.json()["edges"]


@pytest.mark.asyncio
async def test_teaser_ignores_private_links(client):
    await create_test_user("tz_a"); await _login(client, "tz_a")
    a, b = await _mk_obs(client, "A"), await _mk_obs(client, "B")
    resp = await _post_link(client, a, b)
    assert resp.status_code in (200, 201), resp.text
    assert await _edges(client) == 0          # КРАСНЫЙ на старом коде: считались все связи


@pytest.mark.asyncio
async def test_teaser_counts_public_links(client):
    """ОХРАННЫЙ (зелёный до патча): связь двух публичных записей считается."""
    await create_test_user("tz_b"); await _login(client, "tz_b")
    a, b = await _mk_obs(client, "A", vis="public"), await _mk_obs(client, "B", vis="public")
    resp = await _post_link(client, a, b)
    assert resp.status_code in (200, 201), resp.text
    assert await _edges(client) == 1
