"""Очистка мертвых сессий: отозванных и тех, чей refresh-токен уже истек.

Проверка обновления токена одинаково отвергает отозванную и отсутствующую запись, поэтому удаление ничего
не ломает. Зато IP-адрес и название браузера не живут в базе дольше срока жизни входа."""
from datetime import datetime, timedelta, timezone
from sqlalchemy import delete, or_
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.config import settings
from app.models.session import Session as SessionModel


async def purge_dead_sessions(db: AsyncSession, user_id: int | None = None) -> int:
    """Удаляет мертвые сессии пользователя (или всех, если user_id не задан). Коммитит вызывающий."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    stmt = delete(SessionModel).where(or_(SessionModel.revoked.is_(True), SessionModel.created_at < cutoff))
    if user_id is not None:
        stmt = stmt.where(SessionModel.user_id == user_id)
    result = await db.execute(stmt)
    return result.rowcount or 0
