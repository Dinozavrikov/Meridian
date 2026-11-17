"""Настройки для самохостинга: CORS из .env, флаг Secure по умолчанию и проверки при старте production."""
import pytest

from app.core.config import Settings, config_problems, TURNSTILE_TEST_SECRET

BASE = dict(
    DATABASE_URL="postgresql+asyncpg://u:p@h/db", SECRET_KEY="a-real-secret-value", MESSAGE_ENCRYPTION_KEY="x",
    ENVIRONMENT="production", SMTP_HOST="smtp.example.com", TURNSTILE_SECRET_KEY="a-real-turnstile-secret",
    COOKIE_SECURE="", CORS_ORIGINS="http://localhost:3000",
)


def make(**kw) -> Settings:
    return Settings(_env_file=None, **{**BASE, **kw})


@pytest.mark.parametrize("raw, expected", [
    ('["https://a.example", "https://b.example"]', ["https://a.example", "https://b.example"]),
    ("https://a.example,https://b.example", ["https://a.example", "https://b.example"]),
    (" https://a.example , https://b.example ,", ["https://a.example", "https://b.example"]),
    ("https://a.example", ["https://a.example"]),
    ("", []),
])
def test_cors_origins_accepts_json_and_comma_list(raw, expected):
    assert make(CORS_ORIGINS=raw).cors_origins == expected


@pytest.mark.parametrize("env, flag, expected", [
    ("production", "", True), ("development", "", False), ("test", "", False),
    ("production", "false", False), ("production", "0", False),
    ("development", "true", True), ("production", "TRUE", True),
])
def test_cookie_secure_default_follows_environment(env, flag, expected):
    assert make(ENVIRONMENT=env, COOKIE_SECURE=flag).cookie_secure is expected


def test_clean_production_has_no_problems():
    assert config_problems(make()) == []


def test_placeholder_secret_key_stops_production():
    problems = config_problems(make(SECRET_KEY="change-me"))
    assert [level for level, _ in problems] == ["error"]
    assert "SECRET_KEY" in problems[0][1]


def test_risky_production_settings_are_warned_about():
    problems = config_problems(make(
        TURNSTILE_SECRET_KEY=TURNSTILE_TEST_SECRET, SMTP_HOST="mailpit", COOKIE_SECURE="false"))
    assert {level for level, _ in problems} == {"warning"}
    text = " ".join(m for _, m in problems)
    assert "тестовый ключ" in text and "mailpit" in text and "Secure" in text
    assert "пуст" in " ".join(m for _, m in config_problems(make(TURNSTILE_SECRET_KEY="")))


def test_development_is_never_flagged():
    assert config_problems(make(ENVIRONMENT="development", SECRET_KEY="change-me", SMTP_HOST="mailpit",
                                TURNSTILE_SECRET_KEY="")) == []


@pytest.mark.asyncio
@pytest.mark.parametrize("env, flag, secure", [
    ("production", "", True), ("development", "", False), ("production", "false", False),
])
async def test_login_cookies_follow_the_default(client, test_user, monkeypatch, env, flag, secure):
    """Настоящий вход: в Set-Cookie обеих кук флаг Secure есть ровно тогда, когда должен."""
    from app.core.config import settings
    monkeypatch.setattr(settings, "ENVIRONMENT", env)
    monkeypatch.setattr(settings, "COOKIE_SECURE", flag)
    r = await client.post("/api/v1/auth/login", json={"username": "testuser", "password": "testpass123"})
    assert r.status_code == 200
    cookies = [h for h in r.headers.get_list("set-cookie") if h.startswith(("access_token", "refresh_token"))]
    assert len(cookies) == 2
    assert all(("; Secure" in c) == secure for c in cookies)
