"""GET /graph/related отдаёт упоминания: зритель видит другой конец, только если видит запись; дубль со связью скрыт."""
import pytest

from tests.conftest import create_test_user
from tests.test_undo import _login, _new_obs

SECRET = "СЕКРЕТНАЯ-ГИПОТЕЗА"


async def _hyp(client, name, vis):
    r = await client.post("/api/v1/hypotheses/", json={"name": name, "date_created": "2026-09-28", "visibility": vis})
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def _related(client, etype, eid):
    r = await client.get(f"/api/v1/graph/related/{etype}/{eid}")
    return r


def _ends(resp, key):
    return {(i["type"], i["id"]) for i in resp.json().get("mentions", {}).get(key, [])}


async def _world(client):
    await create_test_user("mr_a"); await create_test_user("mr_b")
    await _login(client, "mr_a")
    h_priv = await _hyp(client, SECRET, "private")
    h_pub = await _hyp(client, "Публичная", "public")
    text = (f'<p><a href="meridian://hypothesis/{h_priv}">a</a> <a href="meridian://hypothesis/{h_pub}">b</a> '
            f'<a href="meridian://hypothesis/{h_pub}">b2</a></p>')
    obs = await _new_obs(client, text=text, visibility="public")
    return obs["id"], h_priv, h_pub


@pytest.mark.asyncio
async def test_owner_sees_both_directions(client):
    o, hp, hq = await _world(client)
    r = await _related(client, "observation", o)
    assert r.status_code == 200, r.text
    assert _ends(r, "mentions") == {("hypothesis", hp), ("hypothesis", hq)}
    assert len([i for i in r.json()["mentions"]["mentions"] if i["id"] == hq]) == 1   # два упоминания одной записи: одна строка
    back = await _related(client, "hypothesis", hp)
    assert _ends(back, "mentioned_in") == {("observation", o)}
    assert not r.json()["related"]   # упоминание не связь


@pytest.mark.asyncio
async def test_outsider_sees_only_visible_end_and_no_secret(client):
    o, hp, hq = await _world(client)
    await _login(client, "mr_b")
    r = await _related(client, "observation", o)
    assert r.status_code == 200, r.text
    assert _ends(r, "mentions") == {("hypothesis", hq)}
    assert SECRET not in r.text
    closed = await _related(client, "hypothesis", hp)
    assert closed.status_code != 200 and SECRET not in closed.text


@pytest.mark.asyncio
async def test_mention_hidden_when_direct_link_exists(client):
    o, hp, hq = await _world(client)
    r = await client.post(f"/api/v1/graph/links?from_type=observation&from_id={o}&to_type=hypothesis&to_id={hp}&link_type=связано")
    assert r.status_code < 300, r.text
    rel = await _related(client, "observation", o)
    assert _ends(rel, "mentions") == {("hypothesis", hq)}
    assert any(i["id"] == hp for i in rel.json()["related"]["hypothesis"])


@pytest.mark.asyncio
async def test_trashed_end_is_hidden(client):
    o, hp, hq = await _world(client)
    d = await client.delete(f"/api/v1/hypotheses/{hq}")
    assert d.status_code in (200, 204), d.text
    rel = await _related(client, "observation", o)
    assert _ends(rel, "mentions") == {("hypothesis", hp)}
