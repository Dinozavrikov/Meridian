"""GET /graph/related/{type}/{id} для гостя: тот же обход, но видно только публичное; управления связями нет."""
import json

import pytest

from tests.conftest import create_test_user
from tests.test_feed_groups_api import _create_lab, _link, _login, _rec


def _url(t, i):
    return f"/api/v1/graph/related/{t}/{i}"


def _reached(body):
    return {(t, it["id"]) for t, items in body["related"].items() for it in items}


async def _guest_get(client, t, i):
    client.cookies.clear()
    return await client.get(_url(t, i))


@pytest.mark.asyncio
async def test_guest_sees_public_neighbours_but_not_private_or_trashed(client):
    from datetime import datetime, timezone
    u = await create_test_user("gr_u1")
    h = ("hypothesis", await _rec("hypothesis", u.id, visibility="public"))
    pub = ("observation", await _rec("observation", u.id, visibility="public"))
    priv = ("observation", await _rec("observation", u.id, visibility="private", title="SECRET-GR-ZZ"))
    gone = ("observation", await _rec("observation", u.id, visibility="public", title="TRASH-GR-ZZ",
                                      deleted_at=datetime.now(timezone.utc)))
    for x in (pub, priv, gone):
        await _link(u.id, x, h)
    r = await _guest_get(client, *h)
    assert r.status_code == 200, r.text
    assert _reached(r.json()) == {pub}
    dumped = json.dumps(r.json(), ensure_ascii=False)
    assert "SECRET-GR-ZZ" not in dumped and "TRASH-GR-ZZ" not in dumped


@pytest.mark.asyncio
async def test_private_record_between_two_public_ones_is_not_a_bridge_for_a_guest(client):
    u = await create_test_user("gr_u2")
    a = ("hypothesis", await _rec("hypothesis", u.id, visibility="public"))
    b = ("observation", await _rec("observation", u.id, visibility="private"))
    c = ("observation", await _rec("observation", u.id, visibility="public"))
    await _link(u.id, b, a); await _link(u.id, c, b)
    r = await _guest_get(client, *a)
    assert r.status_code == 200, r.text
    assert _reached(r.json()) == set(), "через приватную запись публичная не достаётся"


@pytest.mark.asyncio
async def test_guest_cannot_open_the_graph_of_a_private_or_lab_record(client):
    u = await create_test_user("gr_u3")
    await _login(client, "gr_u3")
    lab = await _create_lab(client, "GR lab", False)
    priv = ("hypothesis", await _rec("hypothesis", u.id, visibility="private", title="PRIV-GR-ZZ"))
    labrec = ("hypothesis", await _rec("hypothesis", u.id, visibility="lab", lab_id=lab["id"], title="LAB-GR-ZZ"))
    for rec in (priv, labrec):
        r = await _guest_get(client, *rec)
        assert r.status_code in (403, 404), r.text
        assert "PRIV-GR-ZZ" not in r.text and "LAB-GR-ZZ" not in r.text


@pytest.mark.asyncio
async def test_guest_gets_no_management_or_personal_data(client):
    u = await create_test_user("gr_u4")
    h = ("hypothesis", await _rec("hypothesis", u.id, visibility="public"))
    o = ("observation", await _rec("observation", u.id, visibility="public"))
    await _link(u.id, o, h, "подтверждает")
    r = await _guest_get(client, *h)
    assert r.status_code == 200, r.text
    items = [it for items in r.json()["related"].values() for it in items]
    assert items, "предусловие: связь видна гостю"
    for it in items:
        assert it["capabilities"] == [] and it["is_own"] is False and it["can_edit"] is False
        assert it["effect"] is None and it.get("shared_with", []) == []


@pytest.mark.asyncio
async def test_logged_in_viewer_still_sees_own_private_neighbour(client):
    u = await create_test_user("gr_u5")
    await _login(client, "gr_u5")
    h = ("hypothesis", await _rec("hypothesis", u.id, visibility="public"))
    priv = ("observation", await _rec("observation", u.id, visibility="private"))
    await _link(u.id, priv, h)
    r = await client.get(_url(*h))
    assert r.status_code == 200, r.text
    assert _reached(r.json()) == {priv}
