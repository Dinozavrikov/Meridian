"""ensure-content для message / lab_join_request / user.bio: текст из базы, доступ по правилам этих типов."""
import pytest
from sqlalchemy import update

from tests.conftest import create_test_user, add_lab_member
from app.db.session import AsyncSessionLocal
from app.models.social import Conversation, LabJoinRequest, Message
from app.models.user import User

TARGET = "app.api.v1.i18n.translate_strings"


@pytest.fixture(autouse=True)
def fake_translate(monkeypatch):
    async def ok(strings, lang):
        return {k: f"EN:{v}" for k, v in strings.items()}
    monkeypatch.setattr(TARGET, ok)


async def _login(client, username, password="pass12345"):
    r = await client.post("/api/v1/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200


async def _ask(client, entity_type, entity_id, field, text="ЛЕВЫЙ ТЕКСТ"):
    r = await client.post("/api/v1/i18n/ensure-content/en", json={"items": [
        {"entity_type": entity_type, "entity_id": entity_id, "field": field, "text": text}]})
    assert r.status_code == 200, r.text
    return r.json()["translations"].get(f"{entity_type}:{entity_id}:{field}")


@pytest.mark.asyncio
async def test_message_only_for_the_two_participants(client):
    a = await create_test_user("pt_a"); b = await create_test_user("pt_b"); await create_test_user("pt_c")
    async with AsyncSessionLocal() as db:
        lo, hi = sorted((a.id, b.id))
        conv = Conversation(user_a_id=lo, user_b_id=hi)
        db.add(conv); await db.flush()
        m = Message(conversation_id=conv.id, author_id=a.id, content="Привет из базы")
        db.add(m); await db.commit()
        mid = m.id
    await _login(client, "pt_b")
    assert await _ask(client, "message", mid, "text") == "EN:Привет из базы"   # текст из базы, не присланный
    await _login(client, "pt_c")
    assert await _ask(client, "message", mid, "text") is None
    assert await _ask(client, "message", 999999, "text") is None


@pytest.mark.asyncio
async def test_join_request_author_and_lab_admins_only(client):
    owner = await create_test_user("pt_o"); applicant = await create_test_user("pt_ap")
    member = await create_test_user("pt_m"); await create_test_user("pt_s")
    await _login(client, "pt_o")
    r = await client.post("/api/v1/labs", json={"name": "Lab pt", "is_public": True, "goal_type": "task", "new_goal_title": "G"})
    lab = r.json()["id"]
    await add_lab_member(lab, member.id, role="member")
    async with AsyncSessionLocal() as db:
        req = LabJoinRequest(lab_id=lab, user_id=applicant.id, message="Возьмите меня")
        db.add(req); await db.commit(); rid = req.id
    for who, expected in [("pt_ap", "EN:Возьмите меня"), ("pt_o", "EN:Возьмите меня"), ("pt_m", None), ("pt_s", None)]:
        await _login(client, who)
        assert await _ask(client, "lab_join_request", rid, "message") == expected, who


@pytest.mark.asyncio
async def test_user_bio_from_db_and_empty_bio_skipped(client):
    u = await create_test_user("pt_u"); empty = await create_test_user("pt_e"); await create_test_user("pt_v")
    async with AsyncSessionLocal() as db:
        await db.execute(update(User).where(User.id == u.id).values(bio="Обо мне"))
        await db.commit()
    await _login(client, "pt_v")
    assert await _ask(client, "user", u.id, "bio") == "EN:Обо мне"
    assert await _ask(client, "user", empty.id, "bio") is None
    assert await _ask(client, "user", 999999, "bio") is None
