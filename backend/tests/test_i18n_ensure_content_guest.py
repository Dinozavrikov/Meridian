"""Гость получает из кэша готовые переводы публичных записей; модель ради него не работает,
приватное и лабораторное не отдается, остальные типы не отдаются вовсе."""
import pytest

from tests.conftest import create_test_user
from tests.test_i18n_ensure_content_access import _ask, _login, _obs, DB_TEXT


@pytest.fixture(autouse=True)
def fake_translate(monkeypatch):
    async def ok(strings, lang):
        return {k: f"EN:{v}" for k, v in strings.items()}
    monkeypatch.setattr("app.api.v1.i18n.translate_strings", ok)


def _as_guest(client):
    client.cookies.clear()


@pytest.mark.asyncio
async def test_guest_gets_cached_translation_of_public_record(client):
    await create_test_user("gc_a"); await create_test_user("gc_b")
    await _login(client, "gc_a")
    oid = await _obs(client, "public")
    await _login(client, "gc_b")
    assert await _ask(client, "observation", oid, "text") == f"EN:{DB_TEXT}"   # кэш наполнил вошедший
    _as_guest(client)
    assert await _ask(client, "observation", oid, "text") == f"EN:{DB_TEXT}"


@pytest.mark.asyncio
async def test_guest_does_not_get_private_record_even_if_cached(client):
    await create_test_user("gc_c")
    await _login(client, "gc_c")
    oid = await _obs(client, "private")
    assert await _ask(client, "observation", oid, "text") == f"EN:{DB_TEXT}"   # владелец, кэш заполнен
    _as_guest(client)
    assert await _ask(client, "observation", oid, "text") is None


@pytest.mark.asyncio
async def test_guest_does_not_start_the_model_for_uncached_text(client, monkeypatch):
    await create_test_user("gc_d")
    await _login(client, "gc_d")
    oid = await _obs(client, "public")
    async def boom(strings, lang):
        raise AssertionError("модель вызвана ради гостя")
    monkeypatch.setattr("app.api.v1.i18n.translate_strings", boom)
    _as_guest(client)
    r = await client.post("/api/v1/i18n/ensure-content/en", json={"items": [
        {"entity_type": "observation", "entity_id": oid, "field": "text", "text": "x"}]})
    assert r.status_code == 200, r.text
    assert r.json()["translations"] == {} and r.json()["missing"] == []


@pytest.mark.asyncio
async def test_guest_gets_nothing_for_non_record_types(client):
    """У пользователя bio непустое и вошедший его переводит; гость тот же тип не получает вовсе."""
    from sqlalchemy import update
    from app.db.session import AsyncSessionLocal
    from app.models.user import User
    owner = await create_test_user("gc_e")
    viewer = await create_test_user("gc_f")
    async with AsyncSessionLocal() as db:
        await db.execute(update(User).where(User.id == owner.id).values(bio="О себе"))
        await db.commit()
    await _login(client, "gc_f")
    assert await _ask(client, "user", owner.id, "bio") == "EN:О себе"   # контроль: тип в принципе переводится
    _as_guest(client)
    assert await _ask(client, "user", owner.id, "bio") is None
