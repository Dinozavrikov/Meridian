"""Удаление комментария уносит ответы на него (подтверждение в интерфейсе обещает именно это)."""
import pytest

from tests.conftest import create_test_user
from tests.test_comments_personal_notes import COMMENTS, _read, _say
from tests.test_feed_groups_api import _login, _rec


@pytest.mark.asyncio
async def test_deleting_a_comment_takes_its_replies_with_it_and_leaves_the_rest(client):
    owner = await create_test_user("cd_own")
    guest = await create_test_user("cd_gst")
    h = ("hypothesis", await _rec("hypothesis", owner.id, visibility="public"))
    await _login(client, guest.username)
    root = await _say(client, *h, "ROOT", stance="confirm")
    await _login(client, owner.username)
    await _say(client, *h, "REPLY", stance="refute", parent_id=root["id"])
    await _say(client, *h, "OTHER", stance="neutral")
    assert set(await _read(client, *h)) == {"ROOT", "REPLY", "OTHER"}, "предусловие"
    await _login(client, guest.username)
    assert (await client.delete(f"{COMMENTS}/{root['id']}")).status_code == 200
    await _login(client, owner.username)
    assert await _read(client, *h) == ["OTHER"]


@pytest.mark.asyncio
async def test_only_the_author_can_delete_a_comment(client):
    owner = await create_test_user("cd_own2")
    guest = await create_test_user("cd_gst2")
    h = ("hypothesis", await _rec("hypothesis", owner.id, visibility="public"))
    await _login(client, guest.username)
    root = await _say(client, *h, "ROOT", stance="confirm")
    await _login(client, owner.username)
    assert (await client.delete(f"{COMMENTS}/{root['id']}")).status_code == 403
    assert await _read(client, *h) == ["ROOT"]
