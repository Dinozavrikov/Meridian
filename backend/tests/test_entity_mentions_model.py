"""Таблица entity_mentions: создана миграцией (не create_all), уникальность и индексы."""
import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.db.session import AsyncSessionLocal
from app.models.entities import EntityMention


def _row(**over):
    return EntityMention(**{"source_type": "observation", "source_id": 1, "field": "text",
                            "target_type": "hypothesis", "target_id": 2, **over})


@pytest.mark.asyncio
async def test_duplicate_mention_is_rejected_but_other_field_or_target_is_fine():
    async with AsyncSessionLocal() as db:
        db.add(_row()); await db.commit()
        db.add_all([_row(field="other"), _row(target_id=3)]); await db.commit()
        db.add(_row())
        with pytest.raises(IntegrityError):
            await db.commit()


@pytest.mark.asyncio
async def test_indexes_come_from_migration():
    async with AsyncSessionLocal() as db:
        names = set((await db.execute(text("SELECT indexname FROM pg_indexes WHERE tablename = 'entity_mentions'"))).scalars().all())
    assert {"ix_entity_mentions_source", "ix_entity_mentions_target", "uq_entity_mentions"} <= names, names
