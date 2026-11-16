from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from app.core.config import settings
from app.db.session import AsyncSessionLocal
from app.models.session import Session as SessionModel
from app.services.recheck_worker import SESSION_PURGE_INTERVAL, purge_due, purge_sessions_once
from tests.conftest import create_test_user


def test_purge_due_runs_at_start_and_then_once_per_interval():
    assert purge_due(None, 0.0) is True
    assert purge_due(100.0, 100.0 + SESSION_PURGE_INTERVAL - 1) is False
    assert purge_due(100.0, 100.0 + SESSION_PURGE_INTERVAL) is True


@pytest.mark.asyncio
async def test_worker_purge_clears_dead_sessions_of_users_who_never_log_in_again():
    u = await create_test_user("wp_a")
    old = datetime.now(timezone.utc) - timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS + 1)
    async with AsyncSessionLocal() as db:
        db.add_all([
            SessionModel(user_id=u.id, jti="wp-live", user_agent="ua", ip_address="1.1.1.1"),
            SessionModel(user_id=u.id, jti="wp-revoked", user_agent="ua", ip_address="2.2.2.2", revoked=True),
            SessionModel(user_id=u.id, jti="wp-expired", user_agent="ua", ip_address="3.3.3.3", created_at=old),
        ])
        await db.commit()
    assert await purge_sessions_once() == 2
    async with AsyncSessionLocal() as db:
        left = set((await db.execute(select(SessionModel.jti).where(SessionModel.user_id == u.id))).scalars())
    assert left == {"wp-live"}
