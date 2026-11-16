"""У гипотезы не может быть двух предложений зрелости в статусе pending: get_maturity_suggestion читает через
scalar_one_or_none и на дубле отвечал бы 500. Защита на уровне БД (частичный уникальный индекс)."""
import pytest
from sqlalchemy.exc import IntegrityError

from tests.test_lab_maturity import _hyp
from tests.test_lab_maturity_votes import _setup
from app.db.session import AsyncSessionLocal
from app.models.entities import MaturitySuggestion


def _sug(h, status):
    return MaturitySuggestion(hypothesis_id=h, raw_signal=3.0, current_level=0, suggested_level=1, reason="", status=status)


@pytest.mark.asyncio
async def test_second_pending_suggestion_is_rejected_by_db(client):
    _, _, _, h = await _setup(client, "pu", 0)
    async with AsyncSessionLocal() as db:
        db.add(_sug(h, "pending")); await db.commit()
    async with AsyncSessionLocal() as db:
        db.add(_sug(h, "pending"))
        with pytest.raises(IntegrityError):
            await db.commit()


@pytest.mark.asyncio
async def test_accepted_and_dismissed_history_is_not_limited(client):
    """ОХРАННЫЙ (зелёный и до патча): индекс только на pending, история не ограничена."""
    _, _, _, h = await _setup(client, "pu2", 0)
    async with AsyncSessionLocal() as db:
        db.add_all([_sug(h, "dismissed"), _sug(h, "dismissed"), _sug(h, "accepted"), _sug(h, "pending")])
        await db.commit()
