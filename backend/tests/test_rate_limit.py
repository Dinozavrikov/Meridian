"""Ограничение частоты: вход, восстановление пароля. Redis настоящий; проверяется ответ 429, а не отсутствие ошибок:
лимитер при сбое Redis молча пропускает запросы, и вхолостую проходящий тест выглядел бы зеленым."""
import logging

import pytest

from app.core import rate_limit
from app.core.config import settings
from app.db.redis import redis_client
from tests.conftest import create_test_user

LOGIN = "/api/v1/auth/login"
FORGOT = "/api/v1/auth/forgot-password"


async def _login(client, username, password, ip=None):
    headers = {"X-Real-IP": ip} if ip else {}
    return await client.post(LOGIN, json={"username": username, "password": password}, headers=headers)


@pytest.mark.asyncio
async def test_hit_blocks_after_the_limit_and_subjects_are_independent():
    for _ in range(3):
        assert (await rate_limit.hit("t", "a", 3, 60))[0] is True
    assert (await rate_limit.hit("t", "a", 3, 60))[0] is False
    assert (await rate_limit.hit("t", "b", 3, 60))[0] is True


@pytest.mark.asyncio
async def test_key_without_expiry_gets_one(monkeypatch):
    from redis.asyncio import Redis
    r = Redis.from_url(settings.REDIS_URL, decode_responses=True)   # свой клиент этого теста и этого цикла событий
    monkeypatch.setattr(rate_limit, "redis_client", r)
    try:
        await r.set("rl:t:forever", 5)                              # ключ, оставшийся без срока после сбоя
        assert await r.ttl("rl:t:forever") == -1, "предусловие: у ключа нет срока"
        await rate_limit.hit("t", "forever", 100, 60)
        assert await r.ttl("rl:t:forever") > 0
    finally:
        await r.delete("rl:t:forever")
        await r.aclose()


@pytest.mark.asyncio
async def test_login_is_blocked_after_failures_even_with_the_right_password(client, monkeypatch):
    monkeypatch.setattr(settings, "RATE_LIMIT_LOGIN_PAIR", 3)
    await create_test_user("rl_user")
    for _ in range(3):
        assert (await _login(client, "rl_user", "wrong")).status_code == 401
    r = await _login(client, "rl_user", "pass12345")
    assert r.status_code == 429
    assert 1 <= int(r.headers["retry-after"]) <= settings.RATE_LIMIT_LOGIN_PAIR_WINDOW
    assert (await _login(client, "rl_other", "wrong")).status_code == 401      # другое имя не задето


@pytest.mark.asyncio
async def test_successful_login_resets_the_failure_counter(client, monkeypatch):
    monkeypatch.setattr(settings, "RATE_LIMIT_LOGIN_PAIR", 3)
    await create_test_user("rl_reset")
    for _ in range(2):
        assert (await _login(client, "rl_reset", "wrong")).status_code == 401
    assert (await _login(client, "rl_reset", "pass12345")).status_code == 200
    for _ in range(3):
        assert (await _login(client, "rl_reset", "wrong")).status_code == 401   # счет пошел заново, 429 нет


@pytest.mark.asyncio
async def test_login_limit_per_address_uses_the_proxy_header(client, monkeypatch):
    monkeypatch.setattr(settings, "RATE_LIMIT_LOGIN_IP", 3)
    for i in range(3):
        assert (await _login(client, f"nobody{i}", "x", ip="198.51.100.9")).status_code == 401
    assert (await _login(client, "nobody9", "x", ip="198.51.100.9")).status_code == 429
    assert (await _login(client, "nobody9", "x", ip="198.51.100.10")).status_code == 401


@pytest.fixture
def no_mail(monkeypatch):
    async def _noop(**kwargs):
        return None
    monkeypatch.setattr("app.api.v1.auth.send_email", _noop)


@pytest.mark.asyncio
async def test_forgot_password_is_limited_per_email_and_unknown_emails_count_too(client, monkeypatch, no_mail):
    monkeypatch.setattr(settings, "RATE_LIMIT_RESET_EMAIL", 2)
    for _ in range(2):
        assert (await client.post(FORGOT, json={"email": "ghost@example.com"})).status_code == 200
    assert (await client.post(FORGOT, json={"email": "ghost@example.com"})).status_code == 429
    assert (await client.post(FORGOT, json={"email": "other@example.com"})).status_code == 200


@pytest.mark.asyncio
async def test_forgot_password_is_limited_per_address(client, monkeypatch, no_mail):
    monkeypatch.setattr(settings, "RATE_LIMIT_RESET_IP", 2)
    for i in range(2):
        assert (await client.post(FORGOT, json={"email": f"a{i}@example.com"}, headers={"X-Real-IP": "203.0.113.5"})).status_code == 200
    assert (await client.post(FORGOT, json={"email": "a9@example.com"}, headers={"X-Real-IP": "203.0.113.5"})).status_code == 429


@pytest.mark.asyncio
async def test_login_still_works_when_redis_is_down(client, monkeypatch, caplog):
    class Broken:
        async def eval(self, *a, **k): raise ConnectionError("redis is down")
        get = ttl = delete = eval
    monkeypatch.setattr(rate_limit, "redis_client", Broken())
    await create_test_user("rl_down")
    caplog.set_level(logging.WARNING)
    assert (await _login(client, "rl_down", "pass12345")).status_code == 200
    assert any("rate limit" in rec.getMessage() for rec in caplog.records)


@pytest.mark.asyncio
async def test_a_stranger_cannot_lock_the_owner_out_from_another_address(client, monkeypatch):
    monkeypatch.setattr(settings, "RATE_LIMIT_LOGIN_PAIR", 3)
    await create_test_user("rl_owner")
    for _ in range(3):
        assert (await _login(client, "rl_owner", "wrong", ip="198.51.100.20")).status_code == 401
    assert (await _login(client, "rl_owner", "wrong", ip="198.51.100.20")).status_code == 429   # его адрес заперт
    assert (await _login(client, "rl_owner", "pass12345", ip="203.0.113.77")).status_code == 200   # хозяин входит с другого


@pytest.mark.asyncio
async def test_failures_from_many_addresses_hit_the_per_name_ceiling(client, monkeypatch):
    monkeypatch.setattr(settings, "RATE_LIMIT_LOGIN_USER", 4)
    monkeypatch.setattr(settings, "RATE_LIMIT_LOGIN_PAIR", 100)
    await create_test_user("rl_spread")
    for i in range(4):
        assert (await _login(client, "rl_spread", "wrong", ip=f"192.0.2.{i + 1}")).status_code == 401
    assert (await _login(client, "rl_spread", "wrong", ip="192.0.2.50")).status_code == 429


@pytest.mark.asyncio
async def test_the_429_text_is_the_translatable_one(client, monkeypatch):
    from app.core.auth_ui_strings import AUTH_UI_STRINGS, RATE_LIMIT_MESSAGE
    monkeypatch.setattr(settings, "RATE_LIMIT_LOGIN_IP", 1)
    assert (await _login(client, "nobody", "x", ip="198.51.100.77")).status_code == 401
    r = await _login(client, "nobody", "x", ip="198.51.100.77")
    assert r.status_code == 429
    assert r.json()["detail"] == RATE_LIMIT_MESSAGE
    assert RATE_LIMIT_MESSAGE in AUTH_UI_STRINGS, "гость не сможет перевести сообщение о лимите"
