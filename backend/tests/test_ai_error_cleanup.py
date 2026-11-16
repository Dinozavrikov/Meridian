"""Миграция чистки: удаляет только сохранённые тексты сбоев ИИ, нормальные выводы не трогает."""
from sqlalchemy import select, text

from app.db.session import AsyncSessionLocal, engine
from app.models.entities import EntityReflectionInsight
from app.services.ai_error_cleanup import PURGE_SQL

JUNK = [
    "Ошибка сравнения: Illegal header value b'Bearer '",
    "ИИ-сервис недоступен (оба провайдера): All connection attempts failed",
]
GOOD = [
    "Недостаточно данных для вывода.",
    "Ошибка сравнения прогнозов часто связана с якорением: что ты думаешь об этом?",
    "ИИ-сервис недоступен был бы плохим названием для паттерна, но это обычный текст.",
]


async def test_purge_removes_only_error_texts():
    async with AsyncSessionLocal() as db:
        for i, txt in enumerate(JUNK + GOOD):
            db.add(EntityReflectionInsight(
                entity_type="prediction", entity_id=i + 1, matched=[], added=[], dropped=[],
                insight=txt, triggered_by="manual",
            ))
        await db.commit()
    async with engine.begin() as conn:
        res = await conn.execute(text(PURGE_SQL))
        assert res.rowcount == len(JUNK)
    async with AsyncSessionLocal() as db:
        left = (await db.execute(select(EntityReflectionInsight.insight))).scalars().all()
    assert sorted(left) == sorted(GOOD)
