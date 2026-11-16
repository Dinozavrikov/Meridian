from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from app.core.config import settings
from app.db.session import AsyncSessionLocal
from app.models.session import Session as SessionModel
from app.services.session_purge import purge_dead_sessions
from tests.conftest import create_test_user


async def _seed(user_id: int, tag: str) -> None:
    old = datetime.now(timezone.utc) - timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS + 1)
    async with AsyncSessionLocal() as db:
        db.add_all([
            SessionModel(user_id=user_id, jti=f"{tag}-live", user_agent="ua", ip_address="1.1.1.1"),
            SessionModel(user_id=user_id, jti=f"{tag}-revoked", user_agent="ua", ip_address="2.2.2.2", revoked=True),
            SessionModel(user_id=user_id, jti=f"{tag}-expired", user_agent="ua", ip_address="3.3.3.3", created_at=old),
        ])
        await db.commit()


async def _jtis(user_id: int) -> set[str]:
    async with AsyncSessionLocal() as db:
        return set((await db.execute(select(SessionModel.jti).where(SessionModel.user_id == user_id))).scalars())


@pytest.mark.asyncio
async def test_purge_all_clears_dead_sessions_of_every_user_and_keeps_live():
    a, b = await create_test_user("sp_a"), await create_test_user("sp_b")
    await _seed(a.id, "a")
    await _seed(b.id, "b")
    async with AsyncSessionLocal() as db:
        removed = await purge_dead_sessions(db)
        await db.commit()
    assert removed == 4
    assert await _jtis(a.id) == {"a-live"}
    assert await _jtis(b.id) == {"b-live"}


@pytest.mark.asyncio
async def test_purge_for_one_user_leaves_others_alone():
    a, b = await create_test_user("sp_c"), await create_test_user("sp_d")
    await _seed(a.id, "c")
    await _seed(b.id, "d")
    async with AsyncSessionLocal() as db:
        await purge_dead_sessions(db, a.id)
        await db.commit()
    assert await _jtis(a.id) == {"c-live"}
    assert await _jtis(b.id) == {"d-live", "d-revoked", "d-expired"}


@pytest.mark.asyncio
async def test_cutoff_follows_refresh_token_lifetime(monkeypatch):
    """Сессия десятилетней давности жива при 30 днях и мертва при 7: срок берется из настроек, не из цифры в коде."""
    u = await create_test_user("sp_e")
    ten_days_ago = datetime.now(timezone.utc) - timedelta(days=10)
    async with AsyncSessionLocal() as db:
        db.add(SessionModel(user_id=u.id, jti="e-ten", user_agent="ua", ip_address="9.9.9.9", created_at=ten_days_ago))
        await db.commit()
    monkeypatch.setattr(settings, "REFRESH_TOKEN_EXPIRE_DAYS", 30)
    async with AsyncSessionLocal() as db:
        await purge_dead_sessions(db, u.id)
        await db.commit()
    assert await _jtis(u.id) == {"e-ten"}
    monkeypatch.setattr(settings, "REFRESH_TOKEN_EXPIRE_DAYS", 7)
    async with AsyncSessionLocal() as db:
        await purge_dead_sessions(db, u.id)
        await db.commit()
    assert await _jtis(u.id) == set()
