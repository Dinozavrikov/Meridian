"""Soft-delete / restore для 6 базовых сущностей (ENTITY_MODELS).

Корзина бессрочная: автоматической зачистки для этих типов нет (осознанно, в
отличие от EntityAttachment с retention 180 дней). Физическое удаление и каскад
PR A (POLYMORPHIC_CHILD_MODELS + Link + EntityHypothesis в event_log.py) —
только через DELETE /{entity_type}/{id}/permanent (api/v1/trash.py).

deleted_at ставится значением, а не func.now(): before_flush-листенер пишет
diff в JSONB через _json_safe(), SQL-выражение превратилось бы в строку 'now()'.

Событие soft_deleted/restored эмитится явно, в дополнение к generic 'updated'
(changed_fields.deleted_at) — то же осознанное дублирование, что у status_changed:
лента/история отличают «человек удалил» без разбора JSONB. Ни то, ни другое
не входит в FEED_EVENT_TYPES."""
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.social import Lab
from app.models.user import User
from sqlalchemy import select

from app.models.entities import EntityTag, PredictionCalibrationResidue, Tag
from app.services.events import emit_event


async def _refuse_if_lab_goal(db: AsyncSession, entity_type: str, entity_id: int) -> None:
    """Задача/вопрос, служащий целью лаборатории (Lab.goal_type/goal_id), нельзя отправить в
    корзину, пока цель не отвязана: иначе участники лабы получают 404 на цель, хотя формально
    ничего не удаляли (решение продукта, 24.09 — вариант Б)."""
    if entity_type not in ("task", "question"):
        return
    lab = await db.scalar(select(Lab).where(Lab.goal_type == entity_type, Lab.goal_id == entity_id))
    if lab is not None:
        raise HTTPException(400, f"Сначала отвяжите цель от лаборатории «{lab.name}»")


async def soft_delete_entity(db: AsyncSession, entity_type: str, obj, user: User) -> None:
    await _refuse_if_lab_goal(db, entity_type, obj.id)
    obj.deleted_at = datetime.now(timezone.utc)
    if entity_type == "observation":
        from app.services.hypothesis_evidence import recompute_for_observation
        await recompute_for_observation(db, obj.id)  # наблюдение ушло в корзину: сигнал связанных гипотез меняется
    await emit_event(
        db, type="soft_deleted", actor_id=user.id,
        entity_type=entity_type, entity_id=obj.id,
        lab_id=obj.lab_id, visibility=obj.visibility,
    )
    await db.commit()


async def restore_entity(db: AsyncSession, entity_type: str, obj, user: User) -> None:
    obj.deleted_at = None
    if entity_type == "observation":
        from app.services.hypothesis_evidence import recompute_for_observation
        await recompute_for_observation(db, obj.id)
    await emit_event(
        db, type="restored", actor_id=user.id,
        entity_type=entity_type, entity_id=obj.id,
        lab_id=obj.lab_id, visibility=obj.visibility,
    )
    await db.commit()


async def _prediction_calibration_residue(db: AsyncSession, pred) -> None:
    """Перед окончательным удалением прогноза сохраняем то, что нужно калибровке (без содержания):
    уверенность, исход, видимость/лабу и имена тегов гипотезы. См. PredictionCalibrationResidue."""
    tag_names: list[str] = []
    if pred.hypothesis_id:
        tag_names = list((await db.execute(
            select(Tag.name).join(EntityTag, EntityTag.tag_id == Tag.id).where(
                EntityTag.entity_type == "hypothesis", EntityTag.entity_id == pred.hypothesis_id,
                Tag.user_id == pred.user_id,
            )
        )).scalars().all())
    db.add(PredictionCalibrationResidue(
        user_id=pred.user_id, visibility=pred.visibility, lab_id=pred.lab_id,
        confidence=pred.confidence, status=pred.status, is_onboarding=pred.is_onboarding,
        tag_names=tag_names,
        hypothesis_id=pred.hypothesis_id, lab_signal_contribution=pred.lab_signal_contribution,
    ))


# entity_type -> хук, который выполняется ДО физического удаления, в той же транзакции
_PRE_PURGE_HOOKS = {"prediction": _prediction_calibration_residue}


async def purge_entity(db: AsyncSession, entity_type: str, obj) -> None:
    """Физическое удаление записи из корзины (единственный такой путь для 6 базовых типов).
    db.delete -> session.deleted -> весь каскад PR A в event_log.py срабатывает без изменений."""
    hook = _PRE_PURGE_HOOKS.get(entity_type)
    if hook is not None:
        await hook(db, obj)
    await db.delete(obj)
    await db.commit()
