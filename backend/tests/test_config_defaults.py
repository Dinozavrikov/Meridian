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


# --- Предупреждения [config]: один раз за запуск приложения, не при каждом импорте ---
import asyncio
import base64
import os
import subprocess
import sys
from pathlib import Path

from app.core.config import PLACEHOLDER_SECRETS

BACKEND_DIR = Path(__file__).resolve().parents[1]


def _run_python(code: str, **env_overrides):
    # app.main подключает шифрование сообщений, ему нужен настоящий ключ Fernet, а не заглушка из BASE
    valid_key = base64.urlsafe_b64encode(b"0" * 32).decode()
    env = {**os.environ, **{k: str(v) for k, v in {**BASE, "MESSAGE_ENCRYPTION_KEY": valid_key, **env_overrides}.items()}}
    return subprocess.run([sys.executable, "-c", code], cwd=BACKEND_DIR, env=env,
                          capture_output=True, text=True, timeout=120)


_RISKY = dict(TURNSTILE_SECRET_KEY=TURNSTILE_TEST_SECRET, SMTP_HOST="mailpit")


def test_importing_config_and_app_prints_no_config_warnings():
    """Импорт config.py (entrypoint, alembic, uvicorn) больше не печатает предупреждения."""
    r = _run_python("import app.core.config; import app.main", **_RISKY)
    assert r.returncode == 0, r.stderr[-800:]
    assert "[config]" not in r.stdout


def test_log_config_warnings_prints_each_warning_exactly_once():
    r = _run_python("from app.core.config import log_config_warnings; log_config_warnings()", **_RISKY)
    assert r.returncode == 0, r.stderr[-800:]
    lines = [ln for ln in r.stdout.splitlines() if ln.startswith("[config]")]
    assert len(lines) == 2, lines
    assert any("TURNSTILE_SECRET_KEY" in ln for ln in lines) and any("SMTP_HOST" in ln for ln in lines)


def test_placeholder_secret_key_still_stops_the_process_on_import():
    placeholder = sorted(PLACEHOLDER_SECRETS)[0]
    r = _run_python("import app.core.config", SECRET_KEY=placeholder)
    assert r.returncode != 0
    assert "SECRET_KEY" in r.stdout + r.stderr


# --- Turnstile: клиентский IP не попадает в журнал ---
def test_turnstile_check_does_not_log_client_ip(monkeypatch, capsys):
    from app.api.v1 import auth

    class FakeResp:
        status_code = 200
        text = "{}"
        def json(self):
            return {"success": True}

    class FakeClient:
        def __init__(self, *a, **k): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *a): return False
        async def post(self, url, data=None, **k):
            assert data["remoteip"] == "203.0.113.7"  # в Cloudflare IP по-прежнему уходит
            return FakeResp()

    monkeypatch.setattr(auth.httpx, "AsyncClient", FakeClient)
    monkeypatch.setattr(auth.settings, "TURNSTILE_SECRET_KEY", "a-real-turnstile-secret")
    assert asyncio.run(auth._verify_turnstile("tok-123", "203.0.113.7")) is True
    out = capsys.readouterr()
    assert "203.0.113.7" not in out.out + out.err
