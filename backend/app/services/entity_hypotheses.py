"""Полиморфные операции над связью «конкурирующая гипотеза» (EntityHypothesis) —
общая логика для Задач и Вопросов, чтобы не дублировать подсчёт консенсуса."""
from sqlalchemy import select, delete, or_
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.lab_access import links_alive
from app.models.entities import Hypothesis, EntityHypothesis, Link, TaskScale, TaskScaleHypothesis, ResearchTask, Question
from app.services.events import emit_event

PARENT_MODELS = {"task": ResearchTask, "question": Question}


async def _parent_lab_context(db: AsyncSession, parent_type: str, parent_id: int) -> tuple[int | None, str]:
    """lab_id/visibility родителя — событие живёт в контексте родителя,
    не самой гипотезы (см. чат-сессию: приватная гипотеза, предложенная
    в лабу через вопрос/задачу, всё равно должна попасть в ленту лабы)."""
    model = PARENT_MODELS.get(parent_type)
    if model is None:
        return None, "private"
    parent = await db.get(model, parent_id)
    if parent is None:
        return None, "private"
    return parent.lab_id, parent.visibility


_NO_FILTER = object()


async def list_hyps(db: AsyncSession, parent_type: str, parent_id: int, viewer_id=_NO_FILTER):
    """viewer_id задан (в т.ч. None=гость): только гипотезы, видимые этому зрителю. Привязка с share=me оставляет
    гипотезу приватной, и участники лаборатории не должны видеть её через вкладки родителя."""
    q = (select(Hypothesis)
         .join(EntityHypothesis, EntityHypothesis.hypothesis_id == Hypothesis.id)
         .where(EntityHypothesis.parent_type == parent_type, EntityHypothesis.parent_id == parent_id, Hypothesis.deleted_at.is_(None)))
    if viewer_id is not _NO_FILTER:
        from app.core.lab_access import entity_visibility_filter
        q = q.where(entity_visibility_filter(Hypothesis, viewer_id))
    rows = (await db.execute(q)).scalars().all()
    return rows


async def add_hyp(db: AsyncSession, parent_type: str, parent_id: int, hyp_id: int, actor_id: int | None = None) -> bool:
    existing = (await db.execute(
        select(EntityHypothesis).where(
            EntityHypothesis.parent_type == parent_type,
            EntityHypothesis.parent_id == parent_id,
            EntityHypothesis.hypothesis_id == hyp_id,
        )
    )).scalar_one_or_none()
    if existing:
        return False
    db.add(EntityHypothesis(parent_type=parent_type, parent_id=parent_id, hypothesis_id=hyp_id))
    if actor_id is not None:
        lab_id, visibility = await _parent_lab_context(db, parent_type, parent_id)
        await emit_event(db, type="competing_hypothesis", actor_id=actor_id, entity_type="hypothesis",
                          entity_id=hyp_id, related_type=parent_type, related_id=parent_id,
                          lab_id=lab_id, visibility=visibility)
    return True


async def remove_hyp(db: AsyncSession, parent_type: str, parent_id: int, hyp_id: int):
    from app.core.lab_access import revoke_shares
    await revoke_shares(db, (parent_type, parent_id), ("hypothesis", hyp_id))
    await db.execute(delete(EntityHypothesis).where(
        EntityHypothesis.parent_type == parent_type,
        EntityHypothesis.parent_id == parent_id,
        EntityHypothesis.hypothesis_id == hyp_id,
    ))


async def get_competition(db: AsyncSession, parent_type: str, parent_id: int, with_scales: bool = False, viewer_id=_NO_FILTER):
    """with_scales=True — только для задач (TaskScale привязан к research_tasks.id)."""
    hyps = await list_hyps(db, parent_type, parent_id, viewer_id)
    task_scales = []
    if with_scales:
        task_scales = (await db.execute(select(TaskScale).where(TaskScale.task_id == parent_id))).scalars().all()

    result = []
    for h in hyps:
        hid = h.id
        links = (await db.execute(
            select(Link).where(
                Link.user_id == h.user_id,
                links_alive(),
                or_(
                    (Link.from_type == "hypothesis") & (Link.from_id == hid),
                    (Link.to_type == "hypothesis") & (Link.to_id == hid),
                )
            )
        )).scalars().all()
        conf = sum(1 for l in links if l.link_type == "подтверждает" and "observation" in (l.from_type, l.to_type))
        ref  = sum(1 for l in links if l.link_type == "опровергает"  and "observation" in (l.from_type, l.to_type))
        total = conf + ref

        scale_avg = 0.0
        if with_scales and task_scales:
            scale_vals = []
            for s in task_scales:
                hyp_ids = (await db.execute(
                    select(TaskScaleHypothesis.hypothesis_id).where(TaskScaleHypothesis.task_scale_id == s.id)
                )).scalars().all()
                if hid in hyp_ids or not hyp_ids:
                    rng = max(s.max_val - s.min_val, 1)
                    scale_vals.append((s.current_val - s.min_val) / rng * 10)
            scale_avg = round(sum(scale_vals) / len(scale_vals), 1) if scale_vals else 0.0

        result.append({
            "id": hid, "name": h.name, "status": h.status, "user_id": h.user_id,
            # user_id нужен фронту исключительно для isOwner() — решение
            # "не переводить свой контент" в списке конкурирующих гипотез
            # (frontend/lib/i18n/use-translated-query.ts), у бэкенда самого
            # правила перевода нет.
            "confirming": conf, "refuting": ref,
            "evidence_score": conf - ref,
            "support_pct": round(conf / total * 100, 1) if total else 0.0,
            "scale_avg": scale_avg,
            "maturity": h.maturity, "stability": h.stability, "risk": h.risk,
        })
    result.sort(key=lambda x: (x["evidence_score"], x["support_pct"], x["scale_avg"]), reverse=True)
    return result
