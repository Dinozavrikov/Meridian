"""Физическое удаление записи чистит упоминания с обеих сторон (она источник и она цель); чужие упоминания не трогает."""
import pytest
from sqlalchemy import select

from app.db.session import AsyncSessionLocal
from app.models.entities import EntityMention, Observation


async def _rows(db):
    return {(m.source_type, m.source_id, m.target_type, m.target_id)
            for m in (await db.execute(select(EntityMention))).scalars().all()}


@pytest.mark.asyncio
async def test_hard_delete_removes_mentions_on_both_sides_only_for_this_record(test_user):
    async with AsyncSessionLocal() as db:
        obs = Observation(user_id=test_user.id, title="o", slug="mn-obs-1", text="x", date="2026-09-28", author="a")
        db.add(obs); await db.commit(); await db.refresh(obs)
        oid, other = obs.id, obs.id + 1_000_000
        db.add_all([
            EntityMention(source_type="observation", source_id=oid, field="text", target_type="hypothesis", target_id=7),   # она источник
            EntityMention(source_type="hypothesis", source_id=7, field="description", target_type="observation", target_id=oid),  # она цель
            EntityMention(source_type="observation", source_id=other, field="text", target_type="hypothesis", target_id=7),  # контроль
            EntityMention(source_type="hypothesis", source_id=7, field="description", target_type="observation", target_id=other),  # контроль
        ])
        await db.commit()

        await db.delete(obs); await db.commit()

        assert await _rows(db) == {("observation", other, "hypothesis", 7), ("hypothesis", 7, "observation", other)}
