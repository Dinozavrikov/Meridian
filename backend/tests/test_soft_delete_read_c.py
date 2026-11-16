"""Soft-delete, фаза 3c: стадии (EntityStage). Граф/поиск/комментарии — отдельным
файлом, после того как будут известны пути роутов."""
import pytest

from tests.conftest import create_test_user
from tests.test_soft_delete_api import TYPES, _delete_url, _login, _make


@pytest.mark.asyncio
@pytest.mark.parametrize("etype", TYPES)
async def test_stage_of_trashed_entity_hidden_and_returns_on_restore(client, etype):
    u = await create_test_user(f"c3_st_{etype}")
    eid = await _make(etype, u.id)
    await _login(client, u.username)
    url = f"/api/v1/{etype}/{eid}/stage"
    r = await client.put(url, json={"stage": "question"})
    assert r.status_code == 200, r.text

    async def listed():
        r = await client.get("/api/v1/stages/question")
        assert r.status_code == 200, r.text
        return [(i["entity_type"], i["entity_id"]) for i in r.json()]

    assert (etype, eid) in await listed()
    assert (await client.delete(_delete_url(etype, eid))).status_code == 204
    assert (etype, eid) not in await listed()
    assert (await client.get(url)).status_code == 404
    assert (await client.put(url, json={"stage": "research"})).status_code == 404

    assert (await client.post(f"/api/v1/{etype}/{eid}/restore")).status_code == 204
    assert (etype, eid) in await listed()
    r = await client.get(url)
    assert r.status_code == 200 and r.json()["current_stage"] == "question"
