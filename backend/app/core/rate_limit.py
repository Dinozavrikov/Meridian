"""Ограничение частоты запросов на Redis: вход, восстановление пароля.

Счетчик за окно считается одной транзакцией (INCR и срок жизни вместе), а ключ без срока получает его:
иначе сбой между двумя вызовами оставил бы человека заблокированным навсегда. Адрес клиента берется
только через core/client_ip.py. Ключи с почтой и именем хранятся хешем. Если Redis недоступен, запросы
проходят без ограничений и пишется предупреждение: сбой кэша не должен закрывать вход всем."""
import hashlib
import logging

from fastapi import HTTPException

from app.core.auth_ui_strings import RATE_LIMIT_MESSAGE as TOO_MANY
from app.db.redis import redis_client

logger = logging.getLogger(__name__)


_COUNT = """
local n = redis.call('INCR', KEYS[1])
if n == 1 or redis.call('TTL', KEYS[1]) < 0 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return {n, redis.call('TTL', KEYS[1])}
"""


def subject_key(value: str) -> str:
    """Имя или почта в виде хеша: сами значения в ключах Redis не лежат."""
    return hashlib.sha256((value or "").strip().lower().encode()).hexdigest()[:32]


def _key(action: str, subject: str) -> str:
    return f"rl:{action}:{subject}"


def _too_many(retry_after: int) -> HTTPException:
    return HTTPException(429, TOO_MANY, headers={"Retry-After": str(max(1, retry_after))})


async def hit(action: str, subject: str, limit: int, window: int) -> tuple[bool, int]:
    """Считает обращение. Возвращает (разрешено, секунд до сброса окна)."""
    try:
        n, ttl = await redis_client.eval(_COUNT, 1, _key(action, subject), window)
    except Exception as e:
        logger.warning("rate limit: Redis недоступен, ограничение не применено (%s)", e)
        return True, 0
    return int(n) <= limit, int(ttl)


async def enforce(action: str, subject: str, limit: int, window: int) -> None:
    """Считает обращение и отвечает 429, если лимит за окно исчерпан. Пустой адрес не ограничивается."""
    if not subject:
        return
    allowed, retry = await hit(action, subject, limit, window)
    if not allowed:
        raise _too_many(retry)


async def ensure_not_blocked(action: str, subject: str, limit: int) -> None:
    """Только проверка, без счета: ответ 429, если неудач уже набралось на лимит."""
    try:
        n = int(await redis_client.get(_key(action, subject)) or 0)
        if n >= limit:
            raise _too_many(int(await redis_client.ttl(_key(action, subject))))
    except HTTPException:
        raise
    except Exception as e:
        logger.warning("rate limit: Redis недоступен, ограничение не применено (%s)", e)


async def record_failure(action: str, subject: str, window: int) -> None:
    await hit(action, subject, 0, window)


async def forget(action: str, subject: str) -> None:
    try:
        await redis_client.delete(_key(action, subject))
    except Exception as e:
        logger.warning("rate limit: Redis недоступен, счетчик не сброшен (%s)", e)
