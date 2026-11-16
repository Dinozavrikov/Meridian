"""PR A, дополнение (подшаг soft-delete): таблицы, не покрытые каскадом —
EntityReflection/EntityReflectionInsight/ScaleValue/ContentTranslation
(в POLYMORPHIC_CHILD_MODELS) и EntityHypothesis (parent_type/parent_id,
отдельная ветка в event_log.py). Контрольные строки чужой сущности
должны остаться — фильтр не должен удалять лишнее."""
import pytest
from datetime import datetime, timedelta, timezone
from sqlalchemy import select

from app.db.session import AsyncSessionLocal
from app.models.entities import (
    Prediction, ResearchTask, Question, Hypothesis, EntityHypothesis,
    EntityReflection, EntityReflectionInsight, ScaleValue,
)
from app.models.i18n import ContentTranslation


async def _count(db, model, **where):
    q = select(model)
    for k, v in where.items():
        q = q.where(getattr(model, k) == v)
    return len((await db.execute(q)).scalars().all())


@pytest.mark.asyncio
async def test_hard_delete_cleans_reflections_scale_values_translations(test_user):
    now = datetime.now(timezone.utc)
    async with AsyncSessionLocal() as db:
        pred = Prediction(
            user_id=test_user.id, title="t", slug="cx-pred-1", text="x",
            date_created="2026-09-24", expected_check_date=now + timedelta(days=1),
        )
        db.add(pred)
        await db.commit()
        await db.refresh(pred)
        pid, foreign = pred.id, pred.id + 1_000_000

        for eid in (pid, foreign):  # foreign — контроль: чужая сущность не должна пострадать
            db.add_all([
                EntityReflection(entity_type="prediction", entity_id=eid, stage="creation",
                                 factors=[], raw_dialogue_text="личный текст", created_at=now),
                EntityReflectionInsight(entity_type="prediction", entity_id=eid, matched=[], added=[],
                                        dropped=[], insight="i", triggered_by="manual"),
                ScaleValue(user_id=test_user.id, entity_type="prediction", entity_id=eid,
                           scale_id="maturity", value=1.0),
                ContentTranslation(entity_type="prediction", entity_id=eid, field="title",
                                   source_hash="h", target_lang="en", translated_text="t"),
            ])
        await db.commit()

        await db.delete(pred)
        await db.commit()

        for model in (EntityReflection, EntityReflectionInsight, ScaleValue, ContentTranslation):
            assert await _count(db, model, entity_type="prediction", entity_id=pid) == 0, model.__name__
            assert await _count(db, model, entity_type="prediction", entity_id=foreign) == 1, model.__name__


@pytest.mark.asyncio
async def test_hard_delete_task_and_question_cleans_entity_hypothesis_parent_side(test_user):
    async with AsyncSessionLocal() as db:
        task = ResearchTask(user_id=test_user.id, name="t", slug="cx-task-1")
        q = Question(user_id=test_user.id, title="q", slug="cx-q-1", date_created="2026-09-24")
        hyp = Hypothesis(user_id=test_user.id, name="h", slug="cx-hyp-1", date_created="2026-09-24")
        db.add_all([task, q, hyp])
        await db.commit()
        for o in (task, q, hyp):
            await db.refresh(o)
        tid, qid, hid = task.id, q.id, hyp.id
        db.add_all([
            EntityHypothesis(parent_type="task", parent_id=tid, hypothesis_id=hid),
            EntityHypothesis(parent_type="question", parent_id=qid, hypothesis_id=hid),
        ])
        await db.commit()

        await db.delete(task)
        await db.commit()
        assert await _count(db, EntityHypothesis, parent_type="task", parent_id=tid) == 0
        assert await _count(db, EntityHypothesis, parent_type="question", parent_id=qid) == 1  # чужая сторона цела

        await db.delete(q)
        await db.commit()
        assert await _count(db, EntityHypothesis, parent_type="question", parent_id=qid) == 0
        assert await _count(db, Hypothesis, id=hid) == 1  # гипотеза-потомок не удаляется
