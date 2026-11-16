"""Поиск для окна связей (GET /graph/search): задачи и убеждения находятся, убеждения только свои, лимит не вытесняет типы."""
import pytest

from tests.test_open_via_link import _login, _mk_obs, _world


async def _search(client, q, only_type=None):
    params = {"q": q}
    if only_type:
        params["only_type"] = only_type
    resp = await client.get("/api/v1/graph/search", params=params)
    assert resp.status_code == 200, resp.text
    return resp.json()


async def _post(client, url, body):
    resp = await client.post(url, json=body)
    assert resp.status_code in (200, 201), resp.text
    return resp.json()["id"]


def _hyp(name):
    return {"name": name, "description": "d", "date_created": "2026-08-06", "status": "идея", "visibility": "private"}


@pytest.mark.asyncio
async def test_search_finds_own_task(client):
    await _world(client)                                     # залогинен ov_a
    tid = await _post(client, "/api/v1/tasks/", {"name": "TSKUNIQ", "visibility": "private"})
    found = await _search(client, "tskuniq", only_type="task")
    assert [(r["type"], r["id"]) for r in found] == [("task", tid)]            # КРАСНЫЙ на старом коде
    mixed = await _search(client, "tskuniq")
    assert ("task", tid) in [(r["type"], r["id"]) for r in mixed]


@pytest.mark.asyncio
async def test_search_finds_own_worldview(client):
    await _world(client)
    wid = await _post(client, "/api/v1/worldview/", {"date": "2026-09-28", "belief": "WVUNIQ belief", "visibility": "private"})
    found = await _search(client, "wvuniq", only_type="worldview")
    assert [(r["type"], r["id"]) for r in found] == [("worldview", wid)]       # КРАСНЫЙ на старом коде
    assert found[0]["is_own"] is True


@pytest.mark.asyncio
async def test_search_does_not_find_foreign_worldview(client):
    """ОХРАННЫЙ (зелёный до патча): убеждения ищутся только свои (решение Алексея, вариант А)."""
    await _world(client)
    await _post(client, "/api/v1/worldview/", {"date": "2026-09-28", "belief": "WVPUBUNIQ belief", "visibility": "public"})
    await _login(client, "ov_b")
    assert await _search(client, "wvpubuniq", only_type="worldview") == []


@pytest.mark.asyncio
async def test_search_cap_does_not_crowd_out_other_types(client):
    """31 гипотеза не должна вытеснять наблюдение из поиска без only_type; с only_type по-прежнему до 30."""
    await _world(client)
    for i in range(31):
        await _post(client, "/api/v1/hypotheses/", _hyp(f"CAPQ h{i}"))
    await _mk_obs(client, "CAPQ obs")
    mixed = await _search(client, "capq")
    assert "observation" in {r["type"] for r in mixed}                         # КРАСНЫЙ на старом коде
    assert sum(1 for r in mixed if r["type"] == "hypothesis") <= 8
    assert len(await _search(client, "capq", only_type="hypothesis")) == 30    # охранная часть


@pytest.mark.asyncio
async def test_search_without_only_type_does_not_return_worldview(client):
    """Убеждения отдаются только по явному only_type=worldview: типы связи общих окон («подтверждает/опровергает»)
    к ним не подходят, а вкладка убеждений показывает любой чужой тип как «Укрепляет»."""
    await _world(client)
    await _post(client, "/api/v1/worldview/", {"date": "2026-09-28", "belief": "WVMIXED belief", "visibility": "private"})
    mixed = await _search(client, "wvmixed")
    assert [r for r in mixed if r["type"] == "worldview"] == []                  # КРАСНЫЙ на старом коде
    assert len(await _search(client, "wvmixed", only_type="worldview")) == 1     # охранная часть
