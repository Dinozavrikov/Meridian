"""GET /comments/unread/summary: бейдж непрочитанного не знает больше самой записи.
Запись стала приватной — человеку, которому она больше не открыта, её название и чужие ответы из бейджа уходят
(тот же 404, что у списка комментариев); владельцу бейдж остаётся."""
import pytest

from app.main import app
from tests.conftest import create_test_user
from tests.test_feed_groups_api import _login, _rec

TITLE = "SECRET-UN-ZZ"
REPLY = "REPLY-UN-ZZ"
ASK = "ASK-UN-ZZ"


async def _as(client, username):
    client.cookies.clear()
    await _login(client, username)


async def _post(client, etype, eid, content, parent_id=None):
    url = app.url_path_for("create_comment", entity_type=etype, entity_id=eid)
    r = await client.post(url, json={"content": content, "parent_id": parent_id})
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


async def _unread(client):
    r = await client.get(app.url_path_for("unread_summary"))
    assert r.status_code == 200, r.text
    return r


async def _make_private(client, eid):
    r = await client.put(f"/api/v1/observation/{eid}/visibility", json={"visibility": "private"})
    assert r.status_code == 200, r.text


@pytest.mark.asyncio
async def test_badge_forgets_record_that_became_private_for_a_non_owner(client):
    a = await create_test_user("un_a1")
    await create_test_user("un_b1")
    eid = await _rec("observation", a.id, visibility="public", title=TITLE)
    await _as(client, "un_b1")
    mine = await _post(client, "observation", eid, ASK)
    await _as(client, "un_a1")
    await _post(client, "observation", eid, REPLY, parent_id=mine)

    await _as(client, "un_b1")
    before = await _unread(client)
    assert [(i["entity_type"], i["entity_id"]) for i in before.json()] == [("observation", eid)], "предусловие: ответ владельца в бейдже"
    assert REPLY in before.text

    await _as(client, "un_a1")
    await _make_private(client, eid)

    await _as(client, "un_b1")
    after = await _unread(client)
    assert after.json() == []
    assert TITLE not in after.text and REPLY not in after.text


@pytest.mark.asyncio
async def test_badge_keeps_record_that_became_private_for_its_owner(client):
    a = await create_test_user("un_a2")
    await create_test_user("un_b2")
    eid = await _rec("observation", a.id, visibility="public", title=TITLE)
    await _as(client, "un_b2")
    await _post(client, "observation", eid, ASK)

    await _as(client, "un_a2")
    await _make_private(client, eid)
    r = await _unread(client)
    assert [(i["entity_type"], i["entity_id"]) for i in r.json()] == [("observation", eid)]
    assert TITLE in r.text
