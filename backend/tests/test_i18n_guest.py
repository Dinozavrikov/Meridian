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
async def test_guest_cannot_translate_arbitrary_strings(client, translate_ok):
    r = await client.post("/api/v1/i18n/ensure/ja", json={"strings": {"Мой приватный текст": "Мой приватный текст"}})
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_whitelist_contains_critical_strings():
    """Охранный: строки, без которых auth-страницы не переведутся, в whitelist есть."""
    for s in ("Войти", "Регистрация", "Пароль", "Публичный слой", "Публичный слой — вы гость"):
        assert s in AUTH_UI_STRINGS, s
