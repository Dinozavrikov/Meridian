"""Поиск для окна связей (GET /graph/search): свои, лабораторные записи коллег и публичные; чужие приватные не находятся."""
import pytest

from tests.test_open_via_link import _login, _mk_obs, _world


async def _search(client, q):
    resp = await client.get("/api/v1/graph/search", params={"q": q})
    assert resp.status_code == 200, resp.text
    return resp.text


async def _setup(client):
    a, b, c, lab, r, n = await _world(client)          # залогинен ov_a
    await _mk_obs(client, "UNIQLABTITLE", lab, "lab")
    await _mk_obs(client, "UNIQPRIVTITLE")


@pytest.mark.asyncio
async def test_member_finds_colleague_lab_record(client):
    await _setup(client)
    await _login(client, "ov_b")
    assert "UNIQLABTITLE" in await _search(client, "uniqlabtitle")       # КРАСНЫЙ на старом коде


@pytest.mark.asyncio
async def test_member_does_not_find_colleague_private_record(client):
    """ОХРАННЫЙ (зелёный до патча)."""
    await _setup(client)
    await _login(client, "ov_b")
    assert "UNIQPRIVTITLE" not in await _search(client, "uniqprivtitle")


@pytest.mark.asyncio
async def test_outsider_does_not_find_lab_record(client):
    """ОХРАННЫЙ (зелёный до патча)."""
    await _setup(client)
    await _login(client, "ov_s")
    assert "UNIQLABTITLE" not in await _search(client, "uniqlabtitle")


@pytest.mark.asyncio
async def test_owner_still_finds_own_private_record(client):
    """ОХРАННЫЙ (зелёный до патча): фильтр видимости не должен потерять свои записи."""
    await _setup(client)
    assert "UNIQPRIVTITLE" in await _search(client, "uniqprivtitle")
