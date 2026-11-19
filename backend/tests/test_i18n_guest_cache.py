"""Гость получает готовые переводы интерфейса из кэша, модель ради него не работает; скрипт прогрева работает без запроса."""
import pytest
from sqlalchemy import delete, select

import app.api.v1.i18n as i18n
from app.models.i18n import UIStringTranslation
from tests.conftest import AsyncSessionLocal, create_test_user
from tests.test_feed_groups_api import _login

K1, K2, K3 = "test.guestcache.one", "test.guestcache.two", "test.guestcache.stale"
SRC1, SRC2, SRC3 = "Первая строка вне гостевого списка", "Вторая строка вне гостевого списка", "Третья строка с измененным текстом"


async def _wipe():
    async with AsyncSessionLocal() as s:
        await s.execute(delete(UIStringTranslation).where(UIStringTranslation.key.like("test.guestcache.%")))
        await s.commit()


@pytest.fixture(autouse=True)
async def _clean():
    await _wipe()
    i18n._guest_requests.clear()
    yield
    await _wipe()


def _forbid_model(monkeypatch):
    calls = []

    async def boom(strings, lang):
        calls.append(strings)
        raise AssertionError("модель вызвана для гостя")
    monkeypatch.setattr(i18n, "translate_strings", boom)
    return calls


@pytest.mark.asyncio
async def test_guest_gets_cached_translations_without_the_model(client, monkeypatch):
    calls = _forbid_model(monkeypatch)
    async with AsyncSessionLocal() as s:
        s.add_all([
            UIStringTranslation(key=K1, source_hash=i18n._hash(SRC1), target_lang="en", translated_text="Cached one"),
            UIStringTranslation(key=K3, source_hash=i18n._hash("Старый текст"), target_lang="en", translated_text="Stale"),
        ])
        await s.commit()
    r = await client.post("/api/v1/i18n/ensure/en", json={"strings": {K1: SRC1, K2: SRC2, K3: SRC3}})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["translations"] == {K1: "Cached one"}, "только готовое и актуальное: ни непереведенного, ни устаревшего"
    assert data["missing"] == [], "гость ничего не дозаказывает, повторять запрос бессмысленно"
    assert calls == []


@pytest.mark.asyncio
async def test_guest_whitelisted_ui_strings_are_still_translated_by_the_model(client, monkeypatch):
    seen = []

    async def fake(strings, lang):
        seen.append(dict(strings))
        return {k: f"T:{v}" for k, v in strings.items()}
    monkeypatch.setattr(i18n, "translate_strings", fake)
    text = sorted(i18n.AUTH_UI_STRINGS)[0]
    r = await client.post("/api/v1/i18n/ensure/en", json={"strings": {K1: text}})
    assert r.status_code == 200, r.text
    assert r.json()["translations"] == {K1: f"T:{text}"} and len(seen) == 1


@pytest.mark.asyncio
async def test_logged_in_user_still_gets_model_translation_and_it_is_cached(client, monkeypatch):
    async def fake(strings, lang):
        return {k: f"T:{v}" for k, v in strings.items()}
    monkeypatch.setattr(i18n, "translate_strings", fake)
    await create_test_user("i18n_user")
    await _login(client, "i18n_user")
    r = await client.post("/api/v1/i18n/ensure/en", json={"strings": {K2: SRC2}})
    assert r.status_code == 200 and r.json()["translations"] == {K2: f"T:{SRC2}"}
    async with AsyncSessionLocal() as s:
        row = (await s.execute(select(UIStringTranslation).where(UIStringTranslation.key == K2))).scalar_one()
    assert row.translated_text == f"T:{SRC2}" and row.source_hash == i18n._hash(SRC2)


@pytest.mark.asyncio
async def test_warm_script_translates_and_caches_without_a_request_or_login(monkeypatch):
    async def fake(strings, lang):
        return {k: f"T:{v}" for k, v in strings.items()}
    monkeypatch.setattr(i18n, "translate_strings", fake)
    from scripts.warm_i18n import warm_locale
    res = await warm_locale("en", [(K1, SRC1), (K2, SRC2)])
    assert res == {"locale": "en", "ok": 2, "failed": 0}
    async with AsyncSessionLocal() as s:
        rows = (await s.execute(select(UIStringTranslation).where(UIStringTranslation.key.like("test.guestcache.%")))).scalars().all()
    assert {r.key: r.translated_text for r in rows} == {K1: f"T:{SRC1}", K2: f"T:{SRC2}"}
