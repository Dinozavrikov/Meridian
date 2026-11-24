"""Вход и регистрация: лимит регистраций, привязка Google к аккаунту с паролем, ссылка для аккаунта без пароля.

Проверяется поведение (ответы, состояние базы, письма), а не наличие строк в коде. Почта при регистрации не подтверждается,
поэтому аккаунт с чужим адресом и своим паролем мог завести кто угодно заранее. Google подтверждает владение адресом,
и при привязке такой пароль обязан перестать работать."""
import re

import pytest
from sqlalchemy import select

from app.api.v1 import auth as auth_module
from app.core.auth_ui_strings import RATE_LIMIT_MESSAGE
from app.core.config import settings
from app.core.security import hash_password
from app.db.session import AsyncSessionLocal
from app.models.entities import Observation
from app.models.session import Session as SessionModel
from app.models.user import User

REGISTER = "/api/v1/auth/register"
LOGIN = "/api/v1/auth/login"
FORGOT = "/api/v1/auth/forgot-password"
RESET = "/api/v1/auth/reset-password"
GOOGLE_CALLBACK = "/api/v1/auth/google/callback"
IP = {"X-Real-IP": "198.51.100.20"}


def _turnstile(monkeypatch, ok: bool):
    async def _check(*args, **kwargs):
        return ok
    monkeypatch.setattr(auth_module, "_verify_turnstile", _check)


def _capture_mail(monkeypatch) -> list[dict]:
    sent: list[dict] = []

    async def _fake(*args, **kwargs):
        sent.append(kwargs)
    monkeypatch.setattr(auth_module, "send_email", _fake)
    return sent


async def _register(client, n: int, *, email=None, username=None, password="newpass123", ip="198.51.100.10"):
    return await client.post(REGISTER, json={
        "username": username or f"reg_user_{n}", "email": email or f"reg{n}@example.com",
        "password": password, "turnstile_token": "t",
    }, headers={"X-Real-IP": ip})


async def _make_user(username: str, *, password="pass12345", google_id=None) -> User:
    async with AsyncSessionLocal() as db:
        user = User(username=username, email=f"{username}@example.com", display_name=username, google_id=google_id,
                    password_hash=hash_password(password) if password else None)
        db.add(user)
        await db.commit()
        await db.refresh(user)
        db.expunge(user)
        return user


async def _active_jtis(user_id: int) -> set[str]:
    """Сессии, которыми еще можно войти: завершенные помечены revoked (или уже вычищены)."""
    async with AsyncSessionLocal() as db:
        rows = (await db.execute(
            select(SessionModel.jti, SessionModel.revoked).where(SessionModel.user_id == user_id)
        )).all()
    return {jti for jti, revoked in rows if not revoked}


def _fake_google(monkeypatch, *, sub: str, email: str):
    class _Resp:
        status_code = 200
        text = ""

        def __init__(self, data):
            self._data = data

        def json(self):
            return self._data

    class _Client:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

        async def post(self, *args, **kwargs):
            return _Resp({"access_token": "google-token"})

        async def get(self, *args, **kwargs):
            return _Resp({"sub": sub, "email": email, "email_verified": True, "name": "Test Person"})

    monkeypatch.setattr(auth_module.httpx, "AsyncClient", _Client)
    monkeypatch.setattr(auth_module, "is_russian_ip", lambda ip: False)


async def _google_callback(client):
    client.cookies.clear()   # в Google приходит гость
    return await client.get(GOOGLE_CALLBACK, params={"code": "c", "state": "s"},
                            headers={**IP, "Cookie": "google_oauth_state=s"})


@pytest.mark.asyncio
async def test_register_is_limited_per_address(client, monkeypatch):
    _turnstile(monkeypatch, True)
    monkeypatch.setattr(settings, "RATE_LIMIT_REGISTER_IP", 3)
    for n in range(3):
        assert (await _register(client, n)).status_code == 200
    r = await _register(client, 3)
    assert r.status_code == 429
    assert r.json()["detail"] == RATE_LIMIT_MESSAGE
    assert r.headers.get("retry-after")
    assert (await _register(client, 4, ip="198.51.100.11")).status_code == 200, "другой адрес лимитом не задет"


@pytest.mark.asyncio
async def test_register_attempts_failing_turnstile_do_not_use_up_the_limit(client, monkeypatch):
    monkeypatch.setattr(settings, "RATE_LIMIT_REGISTER_IP", 2)
    _turnstile(monkeypatch, False)
    for n in range(5):
        r = await _register(client, n)
        assert r.status_code == 400, "проверка не пройдена: обычная ошибка, а не лимит"
    _turnstile(monkeypatch, True)
    assert (await _register(client, 10)).status_code == 200


@pytest.mark.asyncio
async def test_google_login_disarms_a_password_set_before_the_address_was_confirmed(client, monkeypatch):
    _turnstile(monkeypatch, True)
    sent = _capture_mail(monkeypatch)
    r = await _register(client, 0, email="victim@example.com", username="squatter", password="squatpass123")
    assert r.status_code == 200
    uid = r.json()["id"]
    before = await _active_jtis(uid)
    assert len(before) == 1, "предусловие: при регистрации создана сессия"

    _fake_google(monkeypatch, sub="g-victim", email="victim@example.com")
    r = await _google_callback(client)
    assert 300 <= r.status_code < 400

    async with AsyncSessionLocal() as db:
        user = (await db.execute(select(User).where(User.google_id == "g-victim"))).scalar_one()
        kept = (await db.execute(select(Observation).where(Observation.user_id == uid))).scalars().all()
    assert user.id == uid, "это тот же аккаунт, а не новый"
    assert user.password_hash is None
    assert kept, "записи аккаунта на месте"
    after = await _active_jtis(uid)
    assert not (before & after), "прежние сессии завершены"
    assert len(after) == 1, "осталась только сессия входа через Google"
    r = await client.post(LOGIN, json={"username": "squatter", "password": "squatpass123"}, headers=IP)
    assert r.status_code == 401, "прежний пароль больше не работает"
    assert any(m["to"] == "victim@example.com" and "отключен" in m["subject"] for m in sent), "владельцу почты ушло письмо"


@pytest.mark.asyncio
async def test_google_login_leaves_an_already_linked_account_alone(client, monkeypatch):
    sent = _capture_mail(monkeypatch)
    user = await _make_user("both", google_id="g-both")
    _fake_google(monkeypatch, sub="g-both", email=user.email)
    r = await _google_callback(client)
    assert 300 <= r.status_code < 400
    assert not sent
    r = await client.post(LOGIN, json={"username": "both", "password": "pass12345"}, headers=IP)
    assert r.status_code == 200, "пароль привязанного аккаунта не тронут"


@pytest.mark.asyncio
async def test_google_login_creates_an_account_for_an_unknown_address(client, monkeypatch):
    sent = _capture_mail(monkeypatch)
    _fake_google(monkeypatch, sub="g-new", email="fresh@example.com")
    r = await _google_callback(client)
    assert 300 <= r.status_code < 400
    async with AsyncSessionLocal() as db:
        user = (await db.execute(select(User).where(User.google_id == "g-new"))).scalar_one()
    assert user.email == "fresh@example.com"
    assert user.password_hash is None
    assert not sent
    assert len(await _active_jtis(user.id)) == 1


@pytest.mark.asyncio
@pytest.mark.parametrize("google_only", [True, False], ids=["google_only", "with_password"])
async def test_reset_link_is_issued(client, monkeypatch, google_only):
    """Забытый пароль: и обычный аккаунт, и аккаунт без пароля получают ссылку, по которой пароль ставится."""
    sent = _capture_mail(monkeypatch)
    user = await _make_user("link_user", password=None if google_only else "oldpass12345",
                            google_id="g-link" if google_only else None)
    r = await client.post(FORGOT, json={"email": user.email}, headers=IP)
    assert r.status_code == 200
    m = re.search(r"token=([\w-]+)", sent[-1]["body"]) if sent else None
    assert m, "в письме нет ссылки с токеном"
    r = await client.post(RESET, json={"token": m.group(1), "new_password": "freshpass123"}, headers=IP)
    assert r.status_code == 200
    r = await client.post(LOGIN, json={"username": "link_user", "password": "freshpass123"}, headers=IP)
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_google_login_does_not_take_over_an_account_linked_to_another_google(client, monkeypatch):
    sent = _capture_mail(monkeypatch)
    user = await _make_user("owner", google_id="g-owner")
    before = await _active_jtis(user.id)
    _fake_google(monkeypatch, sub="g-intruder", email=user.email)
    r = await _google_callback(client)
    assert 300 <= r.status_code < 400
    assert "google_error=account_linked_other" in r.headers["location"]
    async with AsyncSessionLocal() as db:
        owner = (await db.execute(select(User).where(User.id == user.id))).scalar_one()
        intruder = (await db.execute(select(User).where(User.google_id == "g-intruder"))).scalar_one_or_none()
    assert owner.google_id == "g-owner", "чужой Google не перезаписал привязку"
    assert intruder is None
    assert await _active_jtis(user.id) == before, "новая сессия не выдана"
    assert not sent, "письмо об отключении пароля не уходило"
    r = await client.post(LOGIN, json={"username": "owner", "password": "pass12345"}, headers=IP)
    assert r.status_code == 200, "пароль владельца не тронут"


@pytest.mark.asyncio
async def test_google_callback_from_a_blocked_region_goes_back_to_the_sign_in_page(client, monkeypatch):
    sent = _capture_mail(monkeypatch)
    _fake_google(monkeypatch, sub="g-ru", email="ru@example.com")
    monkeypatch.setattr(auth_module, "is_russian_ip", lambda ip: True)
    r = await _google_callback(client)
    assert 300 <= r.status_code < 400
    assert "google_error=region_blocked" in r.headers["location"]
    async with AsyncSessionLocal() as db:
        assert (await db.execute(select(User).where(User.google_id == "g-ru"))).scalar_one_or_none() is None
    assert not sent


@pytest.mark.asyncio
async def test_google_callback_with_a_wrong_state_goes_back_to_the_sign_in_page(client, monkeypatch):
    _fake_google(monkeypatch, sub="g-state", email="state@example.com")
    client.cookies.clear()
    r = await client.get(GOOGLE_CALLBACK, params={"code": "c", "state": "other"},
                         headers={**IP, "Cookie": "google_oauth_state=s"})
    assert 300 <= r.status_code < 400
    assert "google_error=state_mismatch" in r.headers["location"]
    async with AsyncSessionLocal() as db:
        assert (await db.execute(select(User).where(User.google_id == "g-state"))).scalar_one_or_none() is None
