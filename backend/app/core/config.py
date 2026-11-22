from pydantic_settings import BaseSettings
from typing import List
import json

# Тестовый секрет Cloudflare Turnstile: проверка с ним всегда проходит.
TURNSTILE_TEST_SECRET = "1x0000000000000000000000000000000AA"
PLACEHOLDER_SECRETS = ("", "change-me", "changeme")


class Settings(BaseSettings):
    DATABASE_URL: str
    REDIS_URL: str = "redis://localhost:6379/0"
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    ENVIRONMENT: str = "development"
    CORS_ORIGINS: str = "http://localhost:3000"  # список через запятую или JSON-массив; нужен, только если API отдается с другого адреса, чем сайт
    SMTP_HOST: str = "localhost"
    SMTP_PORT: int = 1025
    SMTP_FROM: str = "noreply@meridian.local"
    SMTP_USER: str | None = None
    SMTP_PASSWORD: str | None = None
    SMTP_USE_TLS: bool = False  # STARTTLS — включаем явно только для реальных relay (Brevo и т.п.), не для mailpit
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GOOGLE_REDIRECT_URI: str = ""
    TURNSTILE_SECRET_KEY: str = ""
    MESSAGE_ENCRYPTION_KEY: str
    COOKIE_SECURE: str = ""  # "true"/"false"; пусто = автоматически: Secure включен при ENVIRONMENT=production (за HTTPS так и нужно)
    # Ограничение частоты (core/rate_limit.py): число обращений за окно в секундах.
    RATE_LIMIT_LOGIN_IP: int = 30
    RATE_LIMIT_LOGIN_IP_WINDOW: int = 600
    RATE_LIMIT_LOGIN_PAIR: int = 10       # неудачных входов под одним именем с одного адреса: его запирает только свой адрес
    RATE_LIMIT_LOGIN_PAIR_WINDOW: int = 900
    RATE_LIMIT_LOGIN_USER: int = 100      # неудач под одним именем со всех адресов вместе: потолок против распределенного подбора
    RATE_LIMIT_LOGIN_USER_WINDOW: int = 3600
    RATE_LIMIT_RESET_IP: int = 10
    RATE_LIMIT_RESET_IP_WINDOW: int = 3600
    RATE_LIMIT_RESET_EMAIL: int = 3
    RATE_LIMIT_RESET_EMAIL_WINDOW: int = 3600

    @property
    def cors_origins(self) -> List[str]:
        raw = (self.CORS_ORIGINS or "").strip()
        if raw.startswith("["):
            return json.loads(raw)
        return [o.strip() for o in raw.split(",") if o.strip()]

    @property
    def cookie_secure(self) -> bool:
        """Флаг Secure у кук входа. Явное значение главнее; пусто: включен в production."""
        v = self.COOKIE_SECURE
        if isinstance(v, bool):
            return v
        v = (v or "").strip().lower()
        if v in ("1", "true", "yes", "on"):
            return True
        if v in ("0", "false", "no", "off"):
            return False
        return self.ENVIRONMENT == "production"

    class Config:
        env_file = ".env"


def config_problems(s: "Settings") -> list[tuple[str, str]]:
    """Проверка настроек при старте, только для production: ("error", ...) останавливает запуск,
    ("warning", ...) только печатается в журнал."""
    if s.ENVIRONMENT != "production":
        return []
    out: list[tuple[str, str]] = []
    if s.SECRET_KEY.strip().lower() in PLACEHOLDER_SECRETS:
        out.append(("error", "SECRET_KEY не задан или оставлен заглушкой: сгенерируйте случайный ключ (openssl rand -hex 32)"))
    if not s.TURNSTILE_SECRET_KEY:
        out.append(("warning", "TURNSTILE_SECRET_KEY пуст: регистрация заблокирована"))
    elif s.TURNSTILE_SECRET_KEY == TURNSTILE_TEST_SECRET:
        out.append(("warning", "TURNSTILE_SECRET_KEY это тестовый ключ Cloudflare: проверка всегда проходит, защиты от ботов нет"))
    if s.SMTP_HOST in ("localhost", "mailpit"):
        out.append(("warning", f"SMTP_HOST={s.SMTP_HOST} это локальный перехватчик почты: письма (например, сброс пароля) не дойдут до пользователей"))
    if not s.cookie_secure:
        out.append(("warning", "куки входа выдаются без флага Secure (COOKIE_SECURE=false): за HTTPS так оставлять нельзя"))
    return out


settings = Settings()

# Критичная ошибка останавливает любой процесс при импорте (в том числе миграции).
for _level, _message in config_problems(settings):
    if _level == "error":
        print(f"[config] {_message}", flush=True)
        raise RuntimeError(_message)


def log_config_warnings(s: "Settings" = settings) -> None:
    """Печатает предупреждения о рискованных настройках. Вызывается один раз из lifespan приложения:
    при импорте config.py печатать нельзя, его импортируют entrypoint, alembic и uvicorn."""
    for level, message in config_problems(s):
        if level == "warning":
            print(f"[config] {message}", flush=True)
