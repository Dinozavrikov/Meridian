"""ensure-content берёт текст из базы и проверяет видимость записи: чужое приватное, корзина и несуществующее не переводятся
и не пишутся в кэш; присланный вместо оригинала текст не переводится."""
import pytest
from sqlalchemy import select, func, update

from tests.conftest import create_test_user, add_lab_member
from app.db.session import AsyncSessionLocal
from app.models.entities import Observation
from app.models.i18n import ContentTranslation

TARGET = "app.api.v1.i18n.translate_strings"
DB_TEXT = "Исходный текст"


@pytest.fixture(autouse=True)
def fake_translate(monkeypatch):
    async def ok(strings, lang):
        return {k: f"EN:{v}" for k, v in strings.items()}
    monkeypatch.setattr(TARGET, ok)


async def _login(client, username, password="pass12345"):
    r = await client.post("/api/v1/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200


async def _lab(client, name, is_public=False):
    r = await client.post("/api/v1/labs", json={"name": name, "is_public": is_public, "goal_type": "task", "new_goal_title": f"G {name}"})
    assert r.status_code == 200, r.text
    return r.json()["id"]


async def _obs(client, visibility="private", lab_id=None):
    r = await client.post("/api/v1/observations/", json={"title": "Т", "date": "2026-09-23", "author": "a", "text": DB_TEXT,
                                                         "lab_id": lab_id, "visibility": visibility, "tags": []})
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def _ask(client, entity_type, entity_id, field, text="ЛЕВЫЙ ТЕКСТ"):
    r = await client.post("/api/v1/i18n/ensure-content/en", json={"items": [
        {"entity_type": entity_type, "entity_id": entity_id, "field": field, "text": text}]})
    assert r.status_code == 200, r.text
    return r.json()["translations"].get(f"{entity_type}:{entity_id}:{field}")


async def _cache_rows():
    async with AsyncSessionLocal() as db:
        return await db.scalar(select(func.count()).select_from(ContentTranslation))


@pytest.mark.asyncio
async def test_visible_record_translates_the_db_text_not_the_sent_one(client):
    await create_test_user("ac_a"); await create_test_user("ac_b")
    await _login(client, "ac_a")
    oid = await _obs(client, "public")
    await _login(client, "ac_b")
    assert await _ask(client, "observation", oid, "text") == f"EN:{DB_TEXT}"


@pytest.mark.asyncio
async def test_stranger_does_not_get_private_record_and_cache_stays_empty(client):
    await create_test_user("ac_c"); await create_test_user("ac_d")
    await _login(client, "ac_c")
    oid = await _obs(client, "private")
    await _login(client, "ac_d")
    assert await _ask(client, "observation", oid, "text") is None
    assert await _cache_rows() == 0


@pytest.mark.asyncio
async def test_missing_record_is_dropped_and_not_cached(client):
    await create_test_user("ac_e")
    await _login(client, "ac_e")
    assert await _ask(client, "observation", 999999, "text") is None
    assert await _cache_rows() == 0


@pytest.mark.asyncio
async def test_trashed_record_is_dropped(client):
    await create_test_user("ac_f"); await create_test_user("ac_g")
    await _login(client, "ac_f")
    oid = await _obs(client, "public")
    async with AsyncSessionLocal() as db:
        await db.execute(update(Observation).where(Observation.id == oid).values(deleted_at=Observation.created_at))
        await db.commit()
    await _login(client, "ac_g")
    assert await _ask(client, "observation", oid, "text") is None


@pytest.mark.asyncio
async def test_lab_record_only_for_lab_members(client):
    await create_test_user("ac_h"); member = await create_test_user("ac_i"); await create_test_user("ac_j")
    await _login(client, "ac_h")
    lab = await _lab(client, "Lab ac")
    oid = await _obs(client, "lab", lab)
    await add_lab_member(lab, member.id, role="member")
    await _login(client, "ac_i")
    assert await _ask(client, "observation", oid, "text") == f"EN:{DB_TEXT}"
    await _login(client, "ac_j")
    assert await _ask(client, "observation", oid, "text") is None


@pytest.mark.asyncio
async def test_derived_fields_need_visibility_and_are_capped(client):
    await create_test_user("ac_k"); await create_test_user("ac_l")
    await _login(client, "ac_k")
    pub = await _obs(client, "public"); priv = await _obs(client, "private")
    await _login(client, "ac_l")
    assert await _ask(client, "observation", pub, "preview", "Короткий отрывок") == "EN:Короткий отрывок"
    assert await _ask(client, "observation", pub, "preview", "а" * 601) is None
    assert await _ask(client, "observation", priv, "preview", "Короткий отрывок") is None


@pytest.mark.asyncio
async def test_result_private_hidden_published_in_public_lab_visible(client):
    await create_test_user("ac_m"); await create_test_user("ac_n")
    await _login(client, "ac_m")
    lab = await _lab(client, "Pub lab ac", is_public=True)
    secret = (await client.post("/api/v1/results/", json={"title": "Секрет", "body": "b", "lab_id": lab, "visibility": "private"})).json()["id"]
    shown = (await client.post("/api/v1/results/", json={"title": "Открытый", "body": "b", "lab_id": lab, "visibility": "lab"})).json()["id"]
    assert (await client.post(f"/api/v1/results/{shown}/publish")).status_code == 200
    await _login(client, "ac_n")
    assert await _ask(client, "result", secret, "title") is None
    assert await _ask(client, "result", shown, "title") == "EN:Открытый"


@pytest.mark.asyncio
async def test_lab_public_visible_private_hidden(client):
    await create_test_user("ac_o"); await create_test_user("ac_p")
    await _login(client, "ac_o")
    pub = await _lab(client, "Публичная лаба", is_public=True); priv = await _lab(client, "Закрытая лаба", is_public=False)
    await _login(client, "ac_p")
    assert await _ask(client, "lab", pub, "name") == "EN:Публичная лаба"
    assert await _ask(client, "lab", priv, "name") is None
