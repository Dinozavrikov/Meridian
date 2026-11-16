import pytest


@pytest.fixture
def turnstile_ok(monkeypatch):
    """/register требует Turnstile (Cloudflare) — в тестах проверку токена
    подменяем, сетевой вызов не делаем."""
    from app.api.v1 import auth as auth_module

    async def _ok(*args, **kwargs):
        return True
    monkeypatch.setattr(auth_module, "_verify_turnstile", _ok)


@pytest.mark.asyncio
async def test_register_new_user(client, turnstile_ok):
    r = await client.post("/api/v1/auth/register", json={
        "username": "newuser",
        "email": "new@example.com",
        "password": "newpass123",
        "turnstile_token": "test-token",
    })
    assert r.status_code == 200
    data = r.json()
    assert data["username"] == "newuser"
    assert "id" in data


@pytest.mark.asyncio
async def test_login_returns_session_cookie(client, test_user):
    r = await client.post("/api/v1/auth/login", json={
        "username": "testuser",
        "password": "testpass123",
    })
    assert r.status_code == 200
    assert "access_token" in r.cookies
    assert "refresh_token" in r.cookies


@pytest.mark.asyncio
async def test_login_wrong_password(client, test_user):
    r = await client.post("/api/v1/auth/login", json={
        "username": "testuser",
        "password": "wrongpass",
    })
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_protected_endpoint_without_auth(client):
    """POST /observations/ требует Depends(get_current_user) — без cookie 401.
    (GET /observations/ на get_current_user_optional — гостю доступен, не
    показатель защищённости; тест целится в реально защищённый маршрут.)"""
    r = await client.post("/api/v1/observations/", json={
        "date": "2026-08-05",
        "author": "Test",
        "title": "Test observation", "text": "Something observed",
    })
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_protected_endpoint_with_auth(client, test_user):
    await client.post("/api/v1/auth/login", json={
        "username": "testuser",
        "password": "testpass123",
    })
    r = await client.post("/api/v1/observations/", json={
        "date": "2026-08-05",
        "author": "Test",
        "title": "Test observation", "text": "Something observed",
    })
    assert r.status_code == 201


_REG = {"username": "botuser", "email": "bot@example.com", "password": "newpass123"}


async def _user_exists(username: str) -> bool:
    from sqlalchemy import select
    from app.db.session import AsyncSessionLocal
    from app.models.user import User
    async with AsyncSessionLocal() as db:
        return (await db.execute(select(User).where(User.username == username))).scalar_one_or_none() is not None


@pytest.mark.asyncio
async def test_register_honeypot_is_rejected_before_turnstile(client, monkeypatch):
    from app.api.v1 import auth as auth_module
    calls = []

    async def _spy(*args, **kwargs):
        calls.append(1)
        return True
    monkeypatch.setattr(auth_module, "_verify_turnstile", _spy)

    r = await client.post("/api/v1/auth/register",
                          json={**_REG, "turnstile_token": "t", "website": "http://spam.example"})
    assert r.status_code == 400
    assert calls == []  # дешёвая проверка срабатывает раньше вызова Cloudflare
    assert not await _user_exists("botuser")


@pytest.mark.asyncio
async def test_register_rejected_when_turnstile_fails(client, monkeypatch):
    from app.api.v1 import auth as auth_module

    async def _fail(*args, **kwargs):
        return False
    monkeypatch.setattr(auth_module, "_verify_turnstile", _fail)

    r = await client.post("/api/v1/auth/register", json={**_REG, "turnstile_token": "t"})
    assert r.status_code == 400
    assert not await _user_exists("botuser")


@pytest.mark.asyncio
async def test_register_without_turnstile_token_is_validation_error(client):
    r = await client.post("/api/v1/auth/register", json=_REG)
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_register_duplicate_username_is_rejected(client, turnstile_ok):
    first = await client.post("/api/v1/auth/register", json={**_REG, "turnstile_token": "t"})
    assert first.status_code == 200, first.text
    second = await client.post("/api/v1/auth/register",
                               json={**_REG, "email": "other@example.com", "turnstile_token": "t"})
    assert second.status_code == 400


@pytest.mark.asyncio
async def test_register_username_with_space_is_rejected_with_clear_message(client, turnstile_ok):
    """Регрессия: 'Тестовый юзер' отклонялся, но текст ('3–32 символа: буквы,
    цифры, _ и -') не говорил про пробелы и на фронте всплывал под паролем
    (все detail[].msg клеились в общую плашку). Теперь бэкенд явно говорит
    про пробелы, фронт кладёт это под username."""
    r = await client.post("/api/v1/auth/register", json={
        "username": "Тестовый юзер",
        "email": "space@example.com",
        "password": "newpass123",
        "turnstile_token": "t",
    })
    assert r.status_code == 422, r.text
    msgs = [d["msg"] for d in r.json()["detail"] if d.get("loc", [])[-1:] == ["username"]]
    assert msgs, r.json()
    assert any("пробел" in m for m in msgs), msgs


@pytest.mark.asyncio
async def test_register_username_without_space_still_passes(client, turnstile_ok):
    """Охранный: нормальный username без пробелов новым правилом не сломан."""
    r = await client.post("/api/v1/auth/register", json={
        "username": "no_space_ok",
        "email": "nospace@example.com",
        "password": "newpass123",
        "turnstile_token": "t",
    })
    assert r.status_code == 200, r.text


@pytest.mark.asyncio
async def test_cookie_secure_flag_follows_setting(client, test_user, monkeypatch):
    """Secure попадает в реальный заголовок Set-Cookie ровно тогда, когда включен в настройках."""
    from app.core.config import settings
    for flag in (True, False):
        monkeypatch.setattr(settings, "COOKIE_SECURE", flag)
        r = await client.post("/api/v1/auth/login", json={"username": "testuser", "password": "testpass123"})
        assert r.status_code == 200
        headers = r.headers.get_list("set-cookie")
        assert len(headers) >= 2
        for h in headers:
            attrs = [a.strip().lower() for a in h.split(";")]
            assert ("secure" in attrs) is flag, h


@pytest.mark.asyncio
async def test_login_purges_own_dead_sessions_only(client):
    """Вход удаляет отозванные и просроченные сессии пользователя (IP и браузер не копятся), живая остается,
    чужие записи не затрагиваются."""
    from datetime import datetime, timedelta, timezone
    from sqlalchemy import select
    from app.core.config import settings
    from app.db.session import AsyncSessionLocal
    from app.models.session import Session as SessionModel
    from tests.conftest import create_test_user

    me = await create_test_user("purge_me")
    other = await create_test_user("purge_other")
    old = datetime.now(timezone.utc) - timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS + 1)
    async with AsyncSessionLocal() as db:
        db.add_all([
            SessionModel(user_id=me.id, jti="live", user_agent="ua", ip_address="1.1.1.1"),
            SessionModel(user_id=me.id, jti="revoked", user_agent="ua", ip_address="2.2.2.2", revoked=True),
            SessionModel(user_id=me.id, jti="expired", user_agent="ua", ip_address="3.3.3.3", created_at=old),
            SessionModel(user_id=other.id, jti="other-revoked", user_agent="ua", ip_address="4.4.4.4", revoked=True),
            SessionModel(user_id=other.id, jti="other-expired", user_agent="ua", ip_address="5.5.5.5", created_at=old),
        ])
        await db.commit()
    r = await client.post("/api/v1/auth/login", json={"username": "purge_me", "password": "pass12345"})
    assert r.status_code == 200
    async with AsyncSessionLocal() as db:
        async def jtis(uid):
            return set((await db.execute(select(SessionModel.jti).where(SessionModel.user_id == uid))).scalars())
        mine, theirs = await jtis(me.id), await jtis(other.id)
    assert "live" in mine and not ({"revoked", "expired"} & mine)
    assert len(mine) == 2   # живая и только что выданная
    assert theirs == {"other-revoked", "other-expired"}
