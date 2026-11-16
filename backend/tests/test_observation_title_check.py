"""CHECK на уровне БД: пустое название не сохраняется, даже если код пишет Observation(...) в обход схемы."""
import pytest
from sqlalchemy.exc import IntegrityError

from app.db.session import AsyncSessionLocal
from app.models.entities import Observation
from tests.conftest import create_test_user

pytestmark = pytest.mark.asyncio


@pytest.mark.parametrize("title", ["", "   ", "\t\n"])
async def test_db_rejects_blank_title(title):
    u = await create_test_user("chk_blank")
    async with AsyncSessionLocal() as db:
        db.add(Observation(user_id=u.id, date="2026-01-02", author="t", title=title, slug="chk", text="x"))
        with pytest.raises(IntegrityError):
            await db.commit()


async def test_db_accepts_real_title():
    u = await create_test_user("chk_ok")
    async with AsyncSessionLocal() as db:
        db.add(Observation(user_id=u.id, date="2026-01-02", author="t", title="Название", slug="chk-ok", text="x"))
        await db.commit()
