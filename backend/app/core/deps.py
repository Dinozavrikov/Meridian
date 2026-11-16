from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.session import get_db
from app.core.security import decode_token
from app.models.user import User
from typing import Optional


def _get_access_token(request: Request) -> Optional[str]:
    return request.cookies.get("access_token")


async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Не авторизован",
    )

    access_token = _get_access_token(request)

    if not access_token:
        raise credentials_exception

    username = decode_token(access_token)

    if not username:
        raise credentials_exception

    result = await db.execute(
        select(User).where(User.username == username)
    )
    user = result.scalar_one_or_none()

    if not user or not user.is_active:
        raise credentials_exception

    # actor_id для ORM-driven event log (before_flush listener, см.
    # app/services/event_log.py) — тот же db-объект живёт до конца запроса
    # (FastAPI кеширует Depends в рамках одного request), значит info
    # доживёт до commit()/flush() в самом роуте.
    db.sync_session.info["actor_id"] = user.id

    return user


async def get_current_user_optional(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> Optional[User]:
    access_token = _get_access_token(request)

    if not access_token:
        return None

    username = decode_token(access_token)

    if not username:
        return None

    result = await db.execute(
        select(User).where(User.username == username)
    )
    user = result.scalar_one_or_none()

    if not user or not user.is_active:
        return None

    db.sync_session.info["actor_id"] = user.id

    return user
