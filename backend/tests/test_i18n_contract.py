"""Контракт /i18n/ensure: при сбое перевода русский оригинал НЕ выдаётся за перевод —
раньше клиент сохранял его в localStorage, и строка навсегда оставалась русской."""
import pytest

from tests.conftest import create_test_user

TARGET = "app.api.v1.i18n.translate_strings"


async def _login(client, username, password="pass12345"):
    r = await client.post("/api/v1/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_failure_returns_only_cached_and_lists_missing(client, monkeypatch):
    async def ok(strings, lang):
        return {k: f"EN:{v}" for k, v in strings.items()}
    monkeypatch.setattr(TARGET, ok)

    await create_test_user("i18n_c1")
    await _login(client, "i18n_c1")
    r = await client.post("/api/v1/i18n/ensure/en", json={"strings": {"a.cached": "Привет"}})
    assert r.json() == {"translations": {"a.cached": "EN:Привет"}, "missing": []}

    async def boom(strings, lang):
        raise RuntimeError("Ollama недоступна")
    monkeypatch.setattr(TARGET, boom)
    r = await client.post("/api/v1/i18n/ensure/en", json={"strings": {"a.cached": "Привет", "a.new": "Мир"}})
    assert r.status_code == 200
    assert r.json() == {"translations": {"a.cached": "EN:Привет"}, "missing": ["a.new"]}


@pytest.mark.asyncio
async def test_content_failure_lists_missing_instead_of_originals(client, monkeypatch):
    async def boom(strings, lang):
        raise RuntimeError("Ollama недоступна")
    monkeypatch.setattr(TARGET, boom)

    await create_test_user("i18n_c2")
    await _login(client, "i18n_c2")
    # запись должна существовать: для несуществующей пункт пропускается, а не попадает в missing
    o = await client.post("/api/v1/observations/", json={"title": "Т", "date": "2026-09-23", "author": "a", "text": "Привет",
                                                         "lab_id": None, "visibility": "private", "tags": []})
    oid = o.json()["id"]
    body = {"items": [{"entity_type": "observation", "entity_id": oid, "field": "text", "text": "Привет"}]}
    r = await client.post("/api/v1/i18n/ensure-content/en", json=body)
    assert r.status_code == 200
    assert r.json() == {"translations": {}, "missing": [f"observation:{oid}:text"]}
