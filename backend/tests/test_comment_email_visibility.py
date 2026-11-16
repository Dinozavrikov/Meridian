"""Письмо об ответе на комментарий (_notify_comment_recipients) не уходит тому, кому запись уже не открыта
(тот же доступ, что у бейджа непрочитанного и у списка комментариев); обычные письма продолжают доходить."""
import pytest

from tests.conftest import create_test_user
from tests.test_feed_groups_api import _rec
from tests.test_unread_summary_visibility import _as, _post, _make_private

TITLE = "SECRET-EM-ZZ"
REPLY = "REPLY-EM-ZZ"
ASK = "ASK-EM-ZZ"


@pytest.fixture
def sent(monkeypatch):
    box = []

    async def fake_send(**kw):
        box.append(kw)

    monkeypatch.setattr("app.api.v1.comments.send_email", fake_send)
    return box


@pytest.mark.asyncio
async def test_no_reply_email_to_commenter_after_record_became_private(client, sent):
    a = await create_test_user("em_a1")
    b = await create_test_user("em_b1")
    eid = await _rec("observation", a.id, visibility="public", title=TITLE)
    await _as(client, "em_b1")
    mine = await _post(client, "observation", eid, ASK)
    await _as(client, "em_a1")
    await _make_private(client, eid)
    sent.clear()
    await _post(client, "observation", eid, REPLY, parent_id=mine)
    assert [m["to"] for m in sent] == [], "письмо о приватной записи ушло человеку без доступа"
    assert not any(TITLE in (m.get("body", "") + m.get("html", "")) for m in sent)


@pytest.mark.asyncio
async def test_reply_email_still_reaches_commenter_on_public_record(client, sent):
    a = await create_test_user("em_a2")
    b = await create_test_user("em_b2")
    eid = await _rec("observation", a.id, visibility="public", title=TITLE)
    await _as(client, "em_b2")
    mine = await _post(client, "observation", eid, ASK)
    await _as(client, "em_a2")
    sent.clear()
    await _post(client, "observation", eid, REPLY, parent_id=mine)
    assert [m["to"] for m in sent] == [b.email]
    assert REPLY in sent[0]["body"] and TITLE in sent[0]["html"]


@pytest.mark.asyncio
async def test_owner_still_gets_email_about_new_comment(client, sent):
    a = await create_test_user("em_a3")
    await create_test_user("em_b3")
    eid = await _rec("observation", a.id, visibility="public", title=TITLE)
    await _as(client, "em_b3")
    sent.clear()
    await _post(client, "observation", eid, ASK)
    assert [m["to"] for m in sent] == [a.email]
