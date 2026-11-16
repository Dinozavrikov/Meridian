"""shared_with в /graph/related (метка «Открыта лаборатории X» в менеджере связей) и сброс согласий при смене видимости через PUT наблюдения."""
import pytest

from app.models.entities import RecordShare
from tests.test_open_via_link import _login, _world
from tests.test_publication_share import _count, _post_link
from tests.test_publication_share_paths import _status


def _item(resp, etype, eid):
    assert resp.status_code == 200, resp.text
    return next((i for i in resp.json()["related"].get(etype, []) if i["id"] == eid), None)


@pytest.mark.asyncio
async def test_owner_sees_shared_with_on_both_ends_of_the_link(client):
    a, b, c, lab, r, n = await _world(client)
    assert (await _post_link(client, n, r, share="lab")).status_code == 200
    it = _item(await client.get(f"/api/v1/graph/related/observation/{n}"), "observation", r)
    assert it is not None and [s["lab_id"] for s in it.get("shared_with") or []] == [lab], it
    assert it["shared_with"][0]["lab_name"] == "ov-lab" and isinstance(it["shared_with"][0]["share_id"], int)
    it = _item(await client.get(f"/api/v1/graph/related/observation/{r}"), "observation", n)
    assert it is not None and [s["lab_id"] for s in it.get("shared_with") or []] == [lab], it


@pytest.mark.asyncio
async def test_member_does_not_get_shared_with(client):
    a, b, c, lab, r, n = await _world(client)
    assert (await _post_link(client, n, r, share="lab")).status_code == 200
    await _login(client, "ov_b")
    it = _item(await client.get(f"/api/v1/graph/related/observation/{r}"), "observation", n)
    assert it is not None, "участник должен видеть открытую запись"
    assert not it.get("shared_with"), it


@pytest.mark.asyncio
async def test_share_me_has_no_shared_with(client):
    """ОХРАННЫЙ (зелёный и до патча): «только мне» ничего не открыл, метки быть не должно."""
    a, b, c, lab, r, n = await _world(client)
    assert (await _post_link(client, n, r, share="me")).status_code == 200
    it = _item(await client.get(f"/api/v1/graph/related/observation/{n}"), "observation", r)
    assert it is not None and not it.get("shared_with"), it


@pytest.mark.asyncio
async def test_put_observation_visibility_change_drops_shares(client):
    """PublishModal наблюдений меняет видимость обычным PUT записи, не /visibility: согласие не должно воскресать."""
    a, b, c, lab, r, n = await _world(client)
    assert (await _post_link(client, n, r, share="lab")).status_code == 200
    base = {"date": "2026-09-23", "author": "a", "title": "N", "text": "x", "tags": []}
    for vis in ({"visibility": "lab", "lab_id": lab}, {"visibility": "private", "lab_id": None}):
        resp = await client.put(f"/api/v1/observations/{n}", json={**base, **vis})
        assert resp.status_code == 200, resp.text
    assert await _count(RecordShare) == 0
    assert await _status(client, "ov_b", f"/api/v1/observations/{n}") != 200


@pytest.mark.asyncio
async def test_shared_with_names_the_shared_record(client):
    """Кнопка «Закрыть доступ» в менеджере связей должна знать, чьё это согласие (запись может быть с любого конца связи)."""
    a, b, c, lab, r, n = await _world(client)
    assert (await _post_link(client, n, r, share="lab")).status_code == 200
    for root, other in ((n, r), (r, n)):
        it = _item(await client.get(f"/api/v1/graph/related/observation/{root}"), "observation", other)
        sw = it["shared_with"][0]
        assert (sw["entity_type"], sw["entity_id"]) == ("observation", n), sw
