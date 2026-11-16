from pydantic_settings import BaseSettings
from typing import List
import json


class Settings(BaseSettings):
    DATABASE_URL: str
    REDIS_URL: str = "redis://localhost:6379/0"
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    ENVIRONMENT: str = "development"
    CORS_ORIGINS: str = '["http://localhost:3000"]'
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
    COOKIE_SECURE: bool = False  # флаг Secure у кук входа. За HTTPS обязательно true; в docker-compose приходит из .env (COOKIE_SECURE)

    @property
    def cors_origins(self) -> List[str]:
        return json.loads(self.CORS_ORIGINS)

    class Config:
        env_file = ".env"


settings = Settings()
