"""GET /feed/public/recently-confirmed (гость): закрытые публичные прогнозы отдаются, без счётчиков связей и мёртвых полей."""
import pytest

from app.api.v1.feed import CLOSED_PREDICTION_STATUSES
from tests.conftest import create_test_user
from tests.test_feed_groups_api import _rec

GONE = ("confirm_count", "refute_count", "related_count", "link_count", "event_type", "related_type", "related_id", "related_title", "meta")


@pytest.mark.asyncio
async def test_recently_confirmed_returns_closed_public_prediction_without_link_counters(client):
    u = await create_test_user("rc_a1")
    closed = sorted(CLOSED_PREDICTION_STATUSES)[0]
    pid = await _rec("prediction", u.id, visibility="public", status=closed)
    priv = await _rec("prediction", u.id, visibility="private", status=closed)

    client.cookies.clear()
    r = await client.get("/api/v1/feed/public/recently-confirmed?limit=10")
    assert r.status_code == 200, r.text
    items = r.json()
    ids = [i["entity_id"] for i in items]
    assert pid in ids, "закрытый публичный прогноз в выдаче"
    assert priv not in ids, "приватный в выдачу не попадает"
    mine = next(i for i in items if i["entity_id"] == pid)
    assert mine["author_username"] == "rc_a1" and mine["type"] == "prediction"
    assert [k for k in GONE if k in mine] == []
