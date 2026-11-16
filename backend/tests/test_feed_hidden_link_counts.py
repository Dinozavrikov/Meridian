"""Публичная лента не раскрывает гостю число приватных связей публичной записи: счётчиков связей в ответе нет вовсе
(они считали все связи владельца, в том числе приватные)."""
import pytest

from app.api.v1.feed import FeedItem
from tests.conftest import create_test_user
from tests.test_feed_groups_api import PUB, _get, _link, _rec

GONE = ("confirm_count", "refute_count", "related_count", "link_count", "event_type", "related_type", "related_id", "related_title", "meta")


def _find(page, key):
    for g in page["groups"]:
        for it in [g["core"], *[m["item"] for m in g["members"]]]:
            if (it["type"], it["entity_id"]) == key:
                return it
    return None


@pytest.mark.asyncio
async def test_guest_gets_no_link_counters_for_public_hypothesis_with_private_links(client):
    u = await create_test_user("hl_a1")
    hid = await _rec("hypothesis", u.id, visibility="public")
    pub = await _rec("observation", u.id, visibility="public", title="PUB-HL-ZZ")
    p1 = await _rec("observation", u.id, visibility="private", title="PRIV1-HL-ZZ")
    p2 = await _rec("observation", u.id, visibility="private", title="PRIV2-HL-ZZ")
    await _link(u.id, ("observation", pub), ("hypothesis", hid), "подтверждает")
    await _link(u.id, ("observation", p1), ("hypothesis", hid), "опровергает")
    await _link(u.id, ("observation", p2), ("hypothesis", hid), "опровергает")

    client.cookies.clear()
    page = await _get(client, PUB)
    item = _find(page, ("hypothesis", hid))
    assert item is not None, "предусловие: публичная гипотеза в ленте гостя"
    assert "comment_count" in item, "предусловие: остальные поля карточки на месте"
    assert [k for k in GONE if k in item] == []


def test_feed_item_model_has_no_link_counters():
    """FeedItem отдаёт и GET /feed/public/recently-confirmed: счётчиков там быть не должно."""
    assert [k for k in GONE if k in FeedItem.model_fields] == []
