from app.core.lab_access import get_live, links_alive, parent_alive_subquery
from app.services.events import emit_event
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, or_
from app.db.session import get_db
from app.core.deps import get_current_user
from app.core.deps import get_current_user_optional
from app.models.user import User
from app.models.entities import ResearchTask, EntityHypothesis, Hypothesis, TaskScale, TaskScaleHypothesis, TaskExpectation
from app.models.social import EntityComment
from app.schemas.entities import TaskCreate, TaskUpdate, TaskOut, HypOut, TaskExpectationCreate, TaskExpectationResolve, TaskExpectationOut
from app.core.lab_access import get_entity_for_view, get_entity_for_lab_manage, entity_visibility_filter, get_entity_for_read, opened_via_link_or_never, require_publication_consent, grant_publication, ShareChoice, visibility_from_lab, resolve_lab_attachment, can_link
from app.services.owner_info import attach_owner_info
from app.services.access_info import attach_access
from app.models.social import Lab
from app.core.slug import unique_slug_for
import json
from typing import List
from datetime import datetime, timedelta, timezone

from app.services.soft_delete import soft_delete_entity
router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.get("/", response_model=List[TaskOut])
async def list_tasks(user: Optional[User] = Depends(get_current_user_optional), db: AsyncSession = Depends(get_db)):
    user_id = user.id if user else None
    rows = (await db.execute(
        select(ResearchTask).where(or_(entity_visibility_filter(ResearchTask, user_id), opened_via_link_or_never(ResearchTask, "task", user_id)))
        .where(ResearchTask.deleted_at.is_(None))  # корзину режем явно
        .order_by(ResearchTask.created_at.desc())
    )).scalars().all()
    out = [TaskOut.model_validate(r) for r in rows]
    await attach_owner_info(db, out)
    await attach_access(db, out, user_id)
    return out


@router.post("/", response_model=TaskOut, status_code=201)
async def create_task(body: TaskCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    slug = await unique_slug_for(db, ResearchTask, body.name)
    visibility = await resolve_lab_attachment(db, body.lab_id, body.visibility, user.id)
    t = ResearchTask(user_id=user.id, name=body.name, slug=slug, description=body.description, status=body.status, progress=body.progress, visibility=visibility, lab_id=body.lab_id)
    db.add(t)
    await db.flush()
    await emit_event(db, type="created", actor_id=user.id, entity_type="task",
                      entity_id=t.id, lab_id=t.lab_id, visibility=t.visibility)
    await db.commit()
    await db.refresh(t)
    return TaskOut.model_validate(t)


@router.get("/{tid}", response_model=TaskOut)
async def get_task(tid: str, user: Optional[User] = Depends(get_current_user_optional), db: AsyncSession = Depends(get_db)):
    uid = user.id if user else None
    if tid.isdigit():
        t = await get_entity_for_read(db, ResearchTask, int(tid), uid)
    else:
        row = (await db.execute(select(ResearchTask).where(ResearchTask.slug == tid))).scalar_one_or_none()
        if not row:
            raise HTTPException(404, "Не найдено")
        t = await get_entity_for_read(db, ResearchTask, row.id, uid)
    out = TaskOut.model_validate(t)
    await attach_owner_info(db, [out])
    await attach_access(db, [out], uid)
    return out


@router.put("/{tid}", response_model=TaskOut)
async def update_task(tid: int, body: TaskUpdate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    t = (await db.execute(select(ResearchTask).where(ResearchTask.id == tid, ResearchTask.user_id == user.id, ResearchTask.deleted_at.is_(None)))).scalar_one_or_none()
    if not t:
        raise HTTPException(404, "Не найдено")
    old_status = t.status
    # Раньше здесь была инлайн-копия логики resolve_lab_attachment без проверки
    # членства (_lab_role) — только существование лабы. Позволяло привязать
    # чужую задачу к любой чужой/приватной лабе по id и получить visibility="lab",
    # видимую реальным участникам этой лабы. Тот же класс бага, что был в
    # predictions.py (см. ACCESS_POLICY.md / документ п.1, п.19) — фикс идентичный.
    from app.core.lab_access import reset_shares_on_visibility_change
    _new_vis = await resolve_lab_attachment(db, body.lab_id, body.visibility, user.id)
    await reset_shares_on_visibility_change(db, "task", t, _new_vis, body.lab_id, actor_id=user.id)
    t.name = body.name
    t.description = body.description
    t.status = body.status
    t.progress = body.progress
    t.visibility = _new_vis
    t.lab_id = body.lab_id
    if body.status != old_status:
        await emit_event(db, type="status_changed", actor_id=user.id, entity_type="task",
                          entity_id=t.id, lab_id=t.lab_id, visibility=t.visibility,
                          meta={"old_status": old_status, "new_status": body.status})
    await db.commit()
    await db.refresh(t)
    return TaskOut.model_validate(t)


@router.delete("/{tid}", status_code=204)
async def delete_task(tid: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    t = (await db.execute(select(ResearchTask).where(ResearchTask.id == tid, ResearchTask.user_id == user.id, ResearchTask.deleted_at.is_(None)))).scalar_one_or_none()
    if not t:
        raise HTTPException(404, "Не найдено")
    # Soft-delete: запись уходит в корзину владельца и хранится бессрочно.
    # Физическое удаление + каскад PR A — только DELETE /{entity_type}/{id}/permanent (trash.py).
    await soft_delete_entity(db, "task", t, user)


@router.get("/{tid}/hypotheses", response_model=List[HypOut])
async def get_task_hyps(tid: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    from app.models.entities import Tag, EntityTag
    await get_entity_for_read(db, ResearchTask, tid, user.id)
    rows = (await db.execute(
        select(Hypothesis)
        .join(EntityHypothesis, EntityHypothesis.hypothesis_id == Hypothesis.id)
        .where(EntityHypothesis.parent_type == "task", EntityHypothesis.parent_id == tid, Hypothesis.deleted_at.is_(None), entity_visibility_filter(Hypothesis, user.id))
    )).scalars().all()
    out = []
    for r in rows:
        h = HypOut.model_validate(r)
        tag_rows = (await db.execute(
            select(Tag.name).join(EntityTag, EntityTag.tag_id == Tag.id)
            .where(EntityTag.entity_type == "hypothesis", EntityTag.entity_id == r.id, Tag.user_id == user.id)
        )).scalars().all()
        h.tags = list(tag_rows)
        out.append(h)
    return out


@router.post("/{tid}/hypotheses/{hid}", status_code=204)
async def add_task_hyp(tid: int, hid: int, share: ShareChoice = None, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    import logging
    logger = logging.getLogger(__name__)
    await get_entity_for_lab_manage(db, ResearchTask, tid, user.id)
    # Проверяем что такой связи ещё нет
    from sqlalchemy import and_
    existing = (await db.execute(
        select(EntityHypothesis).where(
            and_(EntityHypothesis.parent_type == "task", EntityHypothesis.parent_id == tid, EntityHypothesis.hypothesis_id == hid)
        )
    )).scalar_one_or_none()
    if existing:
        return  # уже есть — idempotent
    await can_link(db, Hypothesis, hid, user.id)  # единая политика LINK (lab_access.can_link)
    impacts = await require_publication_consent(db, ("task", await get_live(db, ResearchTask, tid)), ("hypothesis", await get_live(db, Hypothesis, hid)),
                                     user.id, share, same_owner_only=True)  # у привязки нет автора: открывает при одном владельце
    await grant_publication(db, impacts, user.id)
    db.add(EntityHypothesis(parent_type="task", parent_id=tid, hypothesis_id=hid))
    task = await db.get(ResearchTask, tid)
    await emit_event(db, type="competing_hypothesis", actor_id=user.id, entity_type="hypothesis",
                      entity_id=hid, related_type="task", related_id=tid,
                      lab_id=task.lab_id if task else None, visibility=task.visibility if task else "private")
    try:
        await db.commit()
        logger.info(f"EntityHypothesis added: task={tid} hyp={hid}")
    except Exception as e:
        await db.rollback()
        logger.error(f"EntityHypothesis commit failed: task={tid} hyp={hid} err={e}")
        raise HTTPException(500, f"Ошибка сохранения: {e}")


@router.delete("/{tid}/hypotheses/{hid}", status_code=204)
async def remove_task_hyp(tid: int, hid: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await get_entity_for_lab_manage(db, ResearchTask, tid, user.id)
    from app.services.link_events import emit_competing_unlinked
    await emit_competing_unlinked(db, user.id, "task", tid, hid)
    await db.execute(delete(EntityHypothesis).where(EntityHypothesis.parent_type == "task", EntityHypothesis.parent_id == tid, EntityHypothesis.hypothesis_id == hid))
    await db.commit()


# ── Task Scales ────────────────────────────────────────────────────────────

@router.get("/{tid}/scales")
async def list_scales(tid: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await get_entity_for_read(db, ResearchTask, tid, user.id)
    rows = (await db.execute(select(TaskScale).where(TaskScale.task_id == tid))).scalars().all()
    result = []
    for s in rows:
        hyp_ids = (await db.execute(
            select(TaskScaleHypothesis.hypothesis_id).where(
                TaskScaleHypothesis.task_scale_id == s.id,
                TaskScaleHypothesis.hypothesis_id.in_(select(Hypothesis.id).where(
                    Hypothesis.deleted_at.is_(None), entity_visibility_filter(Hypothesis, user.id))))
        )).scalars().all()
        result.append({
            "id": s.id, "task_id": s.task_id, "name": s.name,
            "description": s.description, "min_val": s.min_val, "max_val": s.max_val,
            "current_val": s.current_val, "value_labels": json.loads(s.value_labels or "{}"),
            "auto_formula": s.auto_formula, "unit": s.unit,
            "hypothesis_ids": list(hyp_ids),
        })
    return result


from app.schemas.task_scales import ScaleCreate, ScaleUpdate, ScaleValue


@router.post("/{tid}/scales", status_code=201)
async def create_scale(tid: int, body: ScaleCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await get_entity_for_lab_manage(db, ResearchTask, tid, user.id)
    from app.core.lab_access import can_link
    from app.models.entities import Hypothesis as _Hyp
    hyp_ids = body.hypothesis_ids
    for hid in hyp_ids:
        await can_link(db, _Hyp, hid, user.id)  # привязка к гипотезе = публикация: её надо видеть
    s = TaskScale(
        task_id=tid, name=body.name, description=body.description,
        min_val=body.min_val, max_val=body.max_val, current_val=body.current_val,
        value_labels=json.dumps(body.value_labels, ensure_ascii=False),
        auto_formula=body.auto_formula, unit=body.unit,
    )
    db.add(s)
    await db.flush()
    for hid in hyp_ids:
        db.add(TaskScaleHypothesis(task_scale_id=s.id, hypothesis_id=hid))
    await db.commit()
    await db.refresh(s)
    return {"id": s.id, "name": s.name, "current_val": s.current_val}


@router.put("/{tid}/scales/{sid}")
async def update_scale(tid: int, sid: int, body: ScaleUpdate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await get_entity_for_lab_manage(db, ResearchTask, tid, user.id)
    s = (await db.execute(select(TaskScale).where(TaskScale.id == sid, TaskScale.task_id == tid))).scalar_one_or_none()
    if not s:
        raise HTTPException(404)
    from app.core.lab_access import can_link
    from app.models.entities import Hypothesis as _Hyp
    hyp_ids = body.hypothesis_ids
    for hid in hyp_ids or []:
        await can_link(db, _Hyp, hid, user.id)
    # только поля схемы: task_id и id недоступны (раньше setattr по любому ключу)
    for k, v in body.model_dump(exclude_unset=True, exclude={"hypothesis_ids"}).items():
        if v is None:
            continue
        setattr(s, k, json.dumps(v, ensure_ascii=False) if k == "value_labels" else v)
    if hyp_ids is not None:
        await db.execute(
            delete(TaskScaleHypothesis).where(TaskScaleHypothesis.task_scale_id == sid)
        )
        for hid in hyp_ids:
            db.add(TaskScaleHypothesis(task_scale_id=sid, hypothesis_id=hid))
    await db.commit()
    await db.refresh(s)
    return {"ok": True}


@router.delete("/{tid}/scales/{sid}", status_code=204)
async def delete_scale(tid: int, sid: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await get_entity_for_lab_manage(db, ResearchTask, tid, user.id)
    await db.execute(delete(TaskScale).where(TaskScale.id == sid, TaskScale.task_id == tid))
    await db.commit()


@router.patch("/{tid}/scales/{sid}/value")
async def set_scale_value(tid: int, sid: int, body: ScaleValue, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await get_entity_for_lab_manage(db, ResearchTask, tid, user.id)
    s = (await db.execute(select(TaskScale).where(TaskScale.id == sid, TaskScale.task_id == tid))).scalar_one_or_none()
    if not s:
        raise HTTPException(404)
    s.current_val = body.value
    await db.commit()
    return {"ok": True, "current_val": s.current_val}



@router.get("/{tid}/competition")
async def get_task_competition(tid: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    from app.services.entity_hypotheses import get_competition
    await get_entity_for_read(db, ResearchTask, tid, user.id)
    return await get_competition(db, "task", tid, with_scales=True, viewer_id=user.id)

@router.get("/{tid}/graph")
async def get_task_graph(tid: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    from app.models.entities import Observation, Prediction, Link
    from sqlalchemy import or_

    # Баг: раньше get_entity_for_view() вызывался без сохранения результата,
    # а t.id/t.name/t.status ниже ссылались на неопределённую переменную —
    # NameError на каждый вызов этого эндпоинта. Исправлено.
    t = await get_entity_for_read(db, ResearchTask, tid, user.id)

    nodes, edges = [], []
    nodes.append({"id": f"t_{t.id}", "entity_id": t.id, "label": t.name[:60], "type": "task", "status": t.status, "is_own": t.user_id == user.id})

    hyps = (await db.execute(
        select(Hypothesis).join(EntityHypothesis, EntityHypothesis.hypothesis_id == Hypothesis.id)
        .where(EntityHypothesis.parent_type == "task", EntityHypothesis.parent_id == tid, Hypothesis.deleted_at.is_(None), entity_visibility_filter(Hypothesis, user.id))
    )).scalars().all()

    hyp_ids = set()
    for h in hyps:
        nodes.append({"id": f"h_{h.id}", "entity_id": h.id, "label": h.name[:60], "type": "hypothesis", "status": h.status, "is_own": h.user_id == user.id})
        edges.append({"from": f"t_{t.id}", "to": f"h_{h.id}", "link_type": "содержит"})
        hyp_ids.add(h.id)

    for hid in hyp_ids:
        # Источники гипотезы
        from app.models.entities import SourceDocument
        src_rows = (await db.execute(
            select(SourceDocument).where(
                SourceDocument.entity_type == "hypothesis",
                SourceDocument.entity_id == hid,
                SourceDocument.status == "done",
            )
        )).scalars().all()
        for src in src_rows:
            sid = f"src_{src.id}"
            nodes.append({
                "id":      sid,
                "entity_id": src.id,
                "label":   (src.title or src.url)[:55],
                "type":    "source",
                "verdict": src.verdict,
                "weight":  src.source_weight,
                "url":     src.url,
                "source_type": src.source_type,
                "is_own":  src.user_id == user.id,
            })
            edges.append({"from": f"h_{hid}", "to": sid, "link_type": src.verdict})

        links = (await db.execute(
            select(Link).where(
                links_alive(),
                Link.user_id == user.id,
                or_(
                    (Link.from_type == "hypothesis") & (Link.from_id == hid),
                    (Link.to_type == "hypothesis") & (Link.to_id == hid),
                )
            )
        )).scalars().all()
        for lnk in links:
            f_id = f"{lnk.from_type[0]}_{lnk.from_id}"
            t_id = f"{lnk.to_type[0]}_{lnk.to_id}"
            if f_id not in [n["id"] for n in nodes] and lnk.from_type == "observation":
                o = await db.get(Observation, lnk.from_id)
                if o:
                    # Link/Prediction в этой функции уже отфильтрованы по
                    # user.id == user.id — все observation/prediction узлы
                    # здесь по построению принадлежат текущему юзеру.
                    nodes.append({"id": f_id, "entity_id": o.id, "label": (o.title or o.text or "")[:50], "type": "observation", "is_own": True})
            if t_id not in [n["id"] for n in nodes] and lnk.to_type == "observation":
                o = await db.get(Observation, lnk.to_id)
                if o:
                    nodes.append({"id": t_id, "entity_id": o.id, "label": (o.title or o.text or "")[:50], "type": "observation", "is_own": True})
            edges.append({"from": f_id, "to": t_id, "link_type": lnk.link_type or "связано"})

        preds = (await db.execute(
            select(Prediction).where(Prediction.user_id == user.id, Prediction.hypothesis_id == hid, Prediction.deleted_at.is_(None))
        )).scalars().all()
        for p in preds:
            nodes.append({"id": f"p_{p.id}", "entity_id": p.id, "label": (p.title or p.text or "")[:50], "type": "prediction", "status": p.status, "is_own": True})
            edges.append({"from": f"h_{hid}", "to": f"p_{p.id}", "link_type": "прогноз"})

    return {"nodes": nodes, "edges": edges}


# ── Task expectations (неявный прогноз при закрытии задачи) ────────────────
# Отдельная сущность, НЕ Prediction — сознательно, чтобы бытовые implicit-
# прогнозы не засоряли калибровку по гипотезам. Владелец ожидания — тот,
# кто ЗАКРЫВАЕТ задачу (может отличаться от автора задачи в общей лабе),
# а не автор самой задачи. Видимости у сущности нет в принципе — не
# наследует visibility задачи ни при каких условиях. LLM здесь не участвует,
# поэтому rate-limit не нужен.

@router.post("/{tid}/close-with-expectation", response_model=TaskExpectationOut | None)
async def close_task_with_expectation(
    tid: int,
    body: TaskExpectationCreate | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    task = await get_entity_for_lab_manage(db, ResearchTask, tid, user.id)
    task.status = "решена"

    if body is None:
        await db.commit()
        return None

    # check_at в приоритете над check_in_days, если задан (см. схему) —
    # абсолютная дата с фронтового datetime-picker точнее пресетов в днях.
    resolved_check_at = body.check_at if body.check_at is not None else (
        datetime.now(timezone.utc) + timedelta(days=body.check_in_days)
    )

    exp = TaskExpectation(
        task_id=tid,
        user_id=user.id,
        scale_id=body.scale_id,
        expectation_confidence=body.expectation_confidence,
        expectation_text=body.expectation_text,
        expectation_value=body.expectation_value,
        check_at=resolved_check_at,
        status="pending",
    )
    db.add(exp)

    # Видимый след в самой задаче — тот же принцип, что при accept найденного
    # ответа на вопрос (see questions.py): действие, которое ничего не меняет
    # в наблюдаемой сущности, воспринимается пользователем как будто вообще
    # не сработало (см. баг-репорт в чате: "нажал, окно закрылось, кнопка
    # исчезла, а больше ничего"). Заметка появляется сразу, а не только в
    # момент отложенной проверки.
    check_at_str = resolved_check_at.strftime("%d.%m.%Y")
    note_content = f"Ожидание при закрытии задачи (уверенность {body.expectation_confidence}%, проверка {check_at_str}): «{body.expectation_text}»"
    db.add(EntityComment(
        entity_type="task",
        entity_id=tid,
        author_id=user.id,
        content=note_content,
        source="task_expectation",
    ))

    await db.commit()
    await db.refresh(exp)
    return exp


@router.get("/expectations/pending", response_model=list[TaskExpectationOut])
async def list_pending_expectations(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(
        select(TaskExpectation).where(
            TaskExpectation.user_id == user.id,
            TaskExpectation.status == "pending",
            parent_alive_subquery("task", TaskExpectation.task_id),
            TaskExpectation.check_at <= datetime.now(timezone.utc),
        ).order_by(TaskExpectation.check_at.asc())
    )).scalars().all()
    return rows


@router.post("/expectations/{eid}/resolve", response_model=TaskExpectationOut)
async def resolve_expectation(
    eid: int,
    body: TaskExpectationResolve,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    exp = (await db.execute(
        select(TaskExpectation).where(TaskExpectation.id == eid, TaskExpectation.user_id == user.id)
    )).scalar_one_or_none()
    if not exp:
        raise HTTPException(404, "Не найдено")

    exp.outcome_confidence = body.outcome_confidence
    exp.outcome_value = body.outcome_value
    exp.outcome_text = body.outcome_text
    exp.status = "checked"
    await db.commit()
    await db.refresh(exp)
    return exp


@router.post("/expectations/{eid}/dismiss")
async def dismiss_expectation(
    eid: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    exp = (await db.execute(
        select(TaskExpectation).where(TaskExpectation.id == eid, TaskExpectation.user_id == user.id)
    )).scalar_one_or_none()
    if not exp:
        raise HTTPException(404, "Не найдено")
    exp.status = "dismissed"
    await db.commit()
    return {"ok": True}
