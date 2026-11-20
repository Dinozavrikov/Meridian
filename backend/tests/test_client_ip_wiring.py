"""Адрес клиента из X-Real-IP должен доходить до записи сессии и до лимита гостя.
Юнит-тест функции этого не гарантирует: баг был в том, что места вызова ее не использовали."""
import pytest
from sqlalchemy import select

from tests.conftest import create_test_user


@pytest.mark.asyncio
async def test_login_stores_client_ip_from_proxy_header_in_session(client):
    from app.db.session import AsyncSessionLocal
    from app.models.session import Session as SessionModel

    user = await create_test_user("ipwire_user")
    r = await client.post("/api/v1/auth/login",
                          json={"username": "ipwire_user", "password": "pass12345"},
                          headers={"X-Real-IP": "203.0.113.7"})
    assert r.status_code == 200, r.text
    async with AsyncSessionLocal() as db:
        rows = (await db.execute(select(SessionModel).where(SessionModel.user_id == user.id))).scalars().all()
    assert [s.ip_address for s in rows] == ["203.0.113.7"]


@pytest.fixture
def guest_env(monkeypatch):
    import app.api.v1.i18n as i18n_mod

    async def _tr(strings, locale):
        return {k: f"{v} [{locale}]" for k, v in strings.items()}
    monkeypatch.setattr(i18n_mod, "translate_strings", _tr)
    monkeypatch.setattr(i18n_mod, "_guest_requests", {})  # чистое окно, не зависит от соседних тестов
    return i18n_mod


@pytest.mark.asyncio
async def test_guest_rate_limit_is_per_client_ip_not_shared(client, guest_env):
    from app.core.auth_ui_strings import AUTH_UI_STRINGS
    s = next(iter(AUTH_UI_STRINGS))
    body = {"strings": {s: s}}
    url = "/api/v1/i18n/ensure/ja"

    for _ in range(guest_env._GUEST_MAX):
        r = await client.post(url, json=body, headers={"X-Real-IP": "198.51.100.1"})
        assert r.status_code == 200, r.text
    r = await client.post(url, json=body, headers={"X-Real-IP": "198.51.100.1"})
    assert r.status_code == 429  # лимит для первого гостя действует

    r = await client.post(url, json=body, headers={"X-Real-IP": "198.51.100.2"})
    assert r.status_code == 200, r.text  # второй гость лимитом первого не задет
