"""POST /i18n/ensure/{locale}: кэш переводов строк интерфейса и поведение при сбое."""
import pytest
from sqlalchemy import select

from app.db.session import AsyncSessionLocal
from app.models.i18n import UIStringTranslation
from tests.conftest import create_test_user

TARGET = "app.api.v1.i18n.translate_strings"


async def _login(client, username, password="pass12345"):
    r = await client.post("/api/v1/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_ensure_caches_translations_and_skips_llm_on_repeat(client, monkeypatch):
    calls = []

    async def fake(strings, lang):
        calls.append(dict(strings))
        return {k: f"EN:{v}" for k, v in strings.items()}
    monkeypatch.setattr(TARGET, fake)

    await create_test_user("i18n_u1")
    await _login(client, "i18n_u1")
    body = {"strings": {"a.b": "Привет", "a.c": "Мир"}}
    expected = {"a.b": "EN:Привет", "a.c": "EN:Мир"}

    r = await client.post("/api/v1/i18n/ensure/en", json=body)
    assert r.status_code == 200 and r.json()["translations"] == expected
    r = await client.post("/api/v1/i18n/ensure/en", json=body)
    assert r.json()["translations"] == expected
    assert len(calls) == 1  # второй запрос целиком из кэша


@pytest.mark.asyncio
async def test_changed_source_text_is_retranslated(client, monkeypatch):
    calls = []

    async def fake(strings, lang):
        calls.append(dict(strings))
        return {k: f"EN:{v}" for k, v in strings.items()}
    monkeypatch.setattr(TARGET, fake)

    await create_test_user("i18n_u2")
    await _login(client, "i18n_u2")
    await client.post("/api/v1/i18n/ensure/en", json={"strings": {"a.b": "Привет"}})
    r = await client.post("/api/v1/i18n/ensure/en", json={"strings": {"a.b": "Здравствуйте"}})
    assert r.json()["translations"] == {"a.b": "EN:Здравствуйте"}
    assert len(calls) == 2


@pytest.mark.asyncio
async def test_ru_locale_returns_input_without_llm(client, monkeypatch):
    async def fake(strings, lang):
        raise AssertionError("для ru перевод не нужен")
    monkeypatch.setattr(TARGET, fake)

    await create_test_user("i18n_u3")
    await _login(client, "i18n_u3")
    r = await client.post("/api/v1/i18n/ensure/ru", json={"strings": {"a.b": "Привет"}})
    assert r.status_code == 200 and r.json()["translations"] == {"a.b": "Привет"}


@pytest.mark.asyncio
async def test_translation_failure_is_logged_and_not_cached(client, monkeypatch, capsys):
    """Регресс: сбой перевода был полностью тихим — клиент получал русский текст
    под видом перевода, а в логах backend не оставалось ничего."""
    async def boom(strings, lang):
        raise RuntimeError("Ollama недоступна")
    monkeypatch.setattr(TARGET, boom)

    await create_test_user("i18n_u4")
    await _login(client, "i18n_u4")
    r = await client.post("/api/v1/i18n/ensure/en", json={"strings": {"a.b": "Привет"}})
    assert r.status_code == 200
    out = capsys.readouterr().out
    assert "[i18n]" in out and "Ollama недоступна" in out

    async with AsyncSessionLocal() as db:
        rows = (await db.execute(select(UIStringTranslation))).scalars().all()
    assert rows == []  # сбой не кэшируется
