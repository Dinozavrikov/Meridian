"""Сроки и параметры, которые страница приватности показывает пользователю.

Единый источник: настройки и константы ниже. Куки, ссылка сброса пароля и состояние входа через Google
берут сроки отсюда, поэтому текст на странице не может разойтись с делом."""
from app.core.config import settings

RESET_LINK_MINUTES = 15
GOOGLE_STATE_MINUTES = 10


def minutes_text(n: int) -> str:
    """«1 минуту», «2 минуты», «15 минут»: форма после слова «действует» (винительный падеж)."""
    last, last2 = n % 10, n % 100
    if last == 1 and last2 != 11:
        word = "минуту"
    elif last in (2, 3, 4) and last2 not in (12, 13, 14):
        word = "минуты"
    else:
        word = "минут"
    return f"{n} {word}"


def reset_ttl_text() -> str:
    return minutes_text(RESET_LINK_MINUTES)


def describe_privacy() -> dict:
    access, refresh = settings.ACCESS_TOKEN_EXPIRE_MINUTES, settings.REFRESH_TOKEN_EXPIRE_DAYS
    return {
        "session": {"access_minutes": access, "refresh_days": refresh},
        "reset_link_minutes": RESET_LINK_MINUTES,
        "google_state_minutes": GOOGLE_STATE_MINUTES,
        # Все куки сервиса. purpose нужен странице приватности (по нему подбирается пояснение), срок живет в одном месте.
        "cookies": [
            {"name": "access_token", "purpose": "access", "ttl_seconds": access * 60},
            {"name": "refresh_token", "purpose": "refresh", "ttl_seconds": refresh * 86400},
            {"name": "google_oauth_state", "purpose": "oauth_state", "ttl_seconds": GOOGLE_STATE_MINUTES * 60},
        ],
    }
