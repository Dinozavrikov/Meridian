import pytest
from app.core.auth_ui_strings import AUTH_UI_STRINGS


@pytest.fixture
def translate_ok(monkeypatch):
    """Перевод не ходит в LLM: подменяем translate_strings, возвращаем оригинал+суффикс."""
    from app.api.v1 import i18n as i18n_module
    async def _tr(strings: dict[str, str], locale: str) -> dict[str, str]:
        return {k: f"{v} [{locale}]" for k, v in strings.items()}
    monkeypatch.setattr(i18n_module, "translate_strings", _tr)


@pytest.mark.asyncio
async def test_guest_can_translate_whitelisted_strings(client, translate_ok):
    r = await client.post("/api/v1/i18n/ensure/ja", json={"strings": {"Войти": "Войти", "Пароль": "Пароль"}})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["translations"]["Войти"] == "Войти [ja]"


@pytest.mark.asyncio
async def test_guest_gets_nothing_for_uncached_arbitrary_strings_and_the_model_is_not_called(client, monkeypatch):
    import app.api.v1.i18n as i18n_mod

    async def boom(strings, lang):
        raise AssertionError("модель вызвана ради гостя")
    monkeypatch.setattr(i18n_mod, "translate_strings", boom)
    r = await client.post("/api/v1/i18n/ensure/ja", json={"strings": {"Мой приватный текст": "Мой приватный текст"}})
    assert r.status_code == 200, r.text
    assert r.json()["translations"] == {} and r.json()["missing"] == []


@pytest.mark.asyncio
async def test_whitelist_contains_critical_strings():
    """Охранный: строки, без которых auth-страницы не переведутся, в whitelist есть."""
    for s in ("Войти", "Регистрация", "Пароль", "Публичный слой", "Публичный слой — вы гость"):
        assert s in AUTH_UI_STRINGS, s


@pytest.mark.asyncio
async def test_guest_mixed_batch_translates_whitelisted_and_leaves_the_rest_to_cache(client, monkeypatch):
    """Пачка страницы смешанная (белый список + прочее): модель работает для белых строк, не для остальных."""
    import uuid
    import app.api.v1.i18n as i18n_mod
    sent = []

    async def _tr(strings, lang):
        sent.extend(strings.values())
        return {k: f"{v} [{lang}]" for k, v in strings.items()}
    monkeypatch.setattr(i18n_mod, "translate_strings", _tr)
    loc = "t" + uuid.uuid4().hex[:8]
    private = "Мой приватный текст"
    r = await client.post(f"/api/v1/i18n/ensure/{loc}", json={"strings": {"Войти": "Войти", private: private}})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["translations"].get("Войти") == f"Войти [{loc}]"
    assert private not in data["translations"]
    assert private not in sent
