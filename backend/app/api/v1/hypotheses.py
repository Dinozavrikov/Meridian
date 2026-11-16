from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, or_
from app.core.lab_access import _lab_role
from app.db.session import get_db
from app.core.deps import get_current_user, get_current_user_optional
from app.models.user import User
from app.models.entities import Hypothesis, Tag, EntityTag, HypStatusHistory, EntityHypothesis
from app.schemas.entities import HypCreate, HypUpdate, HypOut, MaturitySuggestionOut
from app.models.entities import MaturitySuggestion, HypStatusHistory as _HSH  # noqa
from app.core.slug import unique_slug_for
from app.services.entity_postprocess import run_entity_postprocessing_background
from app.core.lab_access import get_entity_for_view, get_entity_for_read, entity_visibility_filter, opened_via_link_or_never, resolve_lab_attachment, lab_scope_condition
from app.services.owner_info import attach_owner_info
from app.services.access_info import attach_access
from app.services.events import emit_event
from app.services.evidence_diversity import get_or_compute_evidence_diversity
from app.services.hypothesis_evidence import get_tag_calibration_summary
from app.services.observation_suggestions import suggest_observations_for_hypothesis
from typing import List, Optional

from app.services.soft_delete import soft_delete_entity
router = APIRouter(prefix="/hypotheses", tags=["hypotheses"])
async def _get_tags(db, user_id, eid):
    r = await db.execute(
        select(Tag.name).join(EntityTag, EntityTag.tag_id == Tag.id)
        .where(EntityTag.entity_type == "hypothesis", EntityTag.entity_id == eid, Tag.user_id == user_id)
    )
    return [x[0] for x in r.fetchall()]


async def _set_tags(db, user_id, eid, tags):
    await db.execute(delete(EntityTag).where(EntityTag.entity_type == "hypothesis", EntityTag.entity_id == eid))
    for name in set(t.strip().lower() for t in tags if t.strip()):
        tag = (await db.execute(select(Tag).where(Tag.user_id == user_id, Tag.name == name))).scalar_one_or_none()
        if not tag:
            tag = Tag(user_id=user_id, name=name)
            db.add(tag)
            await db.flush()
        db.add(EntityTag(entity_type="hypothesis", entity_id=eid, tag_id=tag.id))


@router.get("/", response_model=List[HypOut])
async def list_hyps(
    status: Optional[str] = None,
    tag: Optional[str] = None,
    lab_id: Optional[int] = None,
    include_opened: bool = False,
    user: Optional[User] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    user_id = user.id if user else None
    q = select(Hypothesis).where(or_(entity_visibility_filter(Hypothesis, user_id, lab_id=lab_id), opened_via_link_or_never(Hypothesis, "hypothesis", user_id)))
    q = q.where(Hypothesis.deleted_at.is_(None))  # корзину режем явно
    if lab_id is not None:
        q = q.where(lab_scope_condition(Hypothesis, "hypothesis", user_id, lab_id, include_opened=include_opened))
    if status:
        q = q.where(Hypothesis.status == status)
    if tag:
        q = q.join(EntityTag, (EntityTag.entity_type == "hypothesis") & (EntityTag.entity_id == Hypothesis.id))
        q = q.join(Tag, (Tag.id == EntityTag.tag_id) & (Tag.name == tag) & (Tag.user_id == user_id))
    q = q.order_by(Hypothesis.date_created.desc())
    rows = (await db.execute(q)).scalars().all()
    out = []
    for r in rows:
        h = HypOut.model_validate(r)
        h.tags = await _get_tags(db, user_id, r.id) if user_id is not None else []
        out.append(h)
    await attach_owner_info(db, out)
    await attach_access(db, out, user_id)
    return out


@router.post("/", response_model=HypOut, status_code=201)
async def create_hyp(body: HypCreate, background_tasks: BackgroundTasks, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    slug = await unique_slug_for(db, Hypothesis, body.name)
    visibility = await resolve_lab_attachment(db, body.lab_id, body.visibility, user.id)
    hyp = Hypothesis(
        user_id=user.id, name=body.name, slug=slug, description=body.description,
        falsification_criteria=body.falsification_criteria,
        date_created=body.date_created, status=body.status,
        stability=body.stability, research_load=body.research_load, maturity=body.maturity, risk=body.risk,
        visibility=visibility, lab_id=body.lab_id,
    )
    db.add(hyp)
    await db.flush()
    if hyp.lab_id:
        from app.models.social import Lab
        lab = await db.get(Lab, hyp.lab_id)
        # Автопривязка к цели лаборатории — только owner/admin: привязывать им и положено (ACCESS_POLICY.md,
        # ATTACH). Участник создаёт ПРЕДЛОЖЕНИЕ, оно остаётся непривязанным, пока owner/admin не примет его
        # (POST /labs/{id}/hypotheses/{hid}/attach). Раньше привязывало любому участнику — в обход одобрения.
        if lab and lab.goal_type and lab.goal_id and await _lab_role(db, hyp.lab_id, user.id) in ("owner", "admin"):
            existing = (await db.execute(
                select(EntityHypothesis).where(
                    EntityHypothesis.parent_type == lab.goal_type,
                    EntityHypothesis.parent_id == lab.goal_id,
                    EntityHypothesis.hypothesis_id == hyp.id,
                )
            )).scalar_one_or_none()
            if not existing:
                db.add(EntityHypothesis(parent_type=lab.goal_type, parent_id=lab.goal_id, hypothesis_id=hyp.id))
                await emit_event(db, type="competing_hypothesis", actor_id=user.id, entity_type="hypothesis",
                                  entity_id=hyp.id, related_type=lab.goal_type, related_id=lab.goal_id,
                                  lab_id=hyp.lab_id, visibility="lab")
    db.add(HypStatusHistory(hypothesis_id=hyp.id, status=body.status))
    await _set_tags(db, user.id, hyp.id, body.tags)
    await emit_event(db, type="created", actor_id=user.id, entity_type="hypothesis",
                      entity_id=hyp.id, lab_id=hyp.lab_id, visibility=hyp.visibility)
    await db.commit()
    await db.refresh(hyp)
    background_tasks.add_task(run_entity_postprocessing_background, user.id, "hypothesis", hyp.id, f"{body.name}. {body.description}")
    h = HypOut.model_validate(hyp)
    h.tags = body.tags
    return h


@router.get("/tag-calibration")
async def tag_calibration(tag: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Личный 'базовый уровень' по тегу — отдельный эндпоинт (не поле в
    HypOut), запрашивается по имени тега прямо из формы создания/редактирования
    гипотезы, пока пользователь печатает. Возвращает null, если данных
    недостаточно (см. MIN_TAG_CALIBRATION_N) — фронт в этом случае просто
    ничего не показывает."""
    return await get_tag_calibration_summary(db, user.id, tag)


@router.get("/{eid}", response_model=HypOut)
async def get_hyp(eid: str, user: Optional[User] = Depends(get_current_user_optional), db: AsyncSession = Depends(get_db)):
    cond = (Hypothesis.id == int(eid)) if eid.isdigit() else (Hypothesis.slug == eid)
    hyp = (await db.execute(select(Hypothesis).where(cond))).scalar_one_or_none()
    if not hyp:
        raise HTTPException(404, "Не найдено")
    hyp = await get_entity_for_read(db, Hypothesis, hyp.id, user.id if user else None)
    # Ленивый пересчёт: если кэш валиден (не инвалидирован изменением
    # доказательств) — отдаётся мгновенно без каких-либо вызовов LLM,
    # т.к. эмбеддинги источников уже посчитаны заранее при их добавлении.
    diversity = await get_or_compute_evidence_diversity(db, hyp)
    await db.commit()
    await db.refresh(hyp)
    h = HypOut.model_validate(hyp)
    h.evidence_diversity = diversity
    h.tags = await _get_tags(db, user.id if user else None, hyp.id)
    await attach_owner_info(db, [h])
    await attach_access(db, [h], user.id if user else None)
    return h


@router.get("/{eid}/suggested-observations")
async def get_suggested_observations(eid: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """По требованию (кнопка на фронте), не в фоне и не на каждый рендер —
    LLM-классификация не бесплатна. Только свои наблюдения (см. обсуждение
    приватности в чате)."""
    hyp = (await db.execute(select(Hypothesis).where(Hypothesis.id == eid, Hypothesis.user_id == user.id, Hypothesis.deleted_at.is_(None)))).scalar_one_or_none()
    if not hyp:
        raise HTTPException(404, "Не найдено")
    return await suggest_observations_for_hypothesis(db, user.id, hyp)


@router.get("/{eid}/evidence-diversity")
async def get_hyp_evidence_diversity(eid: int, user: Optional[User] = Depends(get_current_user_optional), db: AsyncSession = Depends(get_db)):
    """Отдельный эндпоинт, а не поле в HypOut — страница гипотезы получает
    данные из закэшированного списка (list_hyps) через useEntityUrlSync,
    минуя get_hyp почти всегда, поэтому поле в HypOut на практике никогда
    не долетало бы до фронтенда (см. обсуждение бага в чате). Самодостаточный
    компонент с собственным useQuery по entityId — тот же паттерн, что уже
    используется в ReflectionNudge/ContradictionNudge/MaturitySuggestionBanner."""
    hyp = await get_entity_for_read(db, Hypothesis, eid, user.id if user else None)
    diversity = await get_or_compute_evidence_diversity(db, hyp)
    await db.commit()
    return diversity


@router.put("/{eid}", response_model=HypOut)
async def update_hyp(eid: int, body: HypUpdate, background_tasks: BackgroundTasks, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    hyp = (await db.execute(select(Hypothesis).where(Hypothesis.id == eid, Hypothesis.user_id == user.id, Hypothesis.deleted_at.is_(None)))).scalar_one_or_none()
    if not hyp:
        raise HTTPException(404, "Не найдено")
    status_changed = hyp.status != body.status
    old_status = hyp.status
    if status_changed:
        db.add(HypStatusHistory(hypothesis_id=eid, status=body.status))
    from app.core.lab_access import reset_shares_on_visibility_change
    _new_vis = await resolve_lab_attachment(db, body.lab_id, body.visibility, user.id)
    await reset_shares_on_visibility_change(db, "hypothesis", hyp, _new_vis, body.lab_id, actor_id=user.id)
    hyp.name = body.name
    hyp.description = body.description
    hyp.falsification_criteria = body.falsification_criteria
    hyp.date_created = body.date_created
    hyp.status = body.status
    hyp.stability = body.stability
    hyp.research_load = body.research_load
    hyp.maturity = body.maturity
    hyp.risk = body.risk
    hyp.visibility = _new_vis
    hyp.lab_id = body.lab_id
    # risk, maturity и lab_id входят в формулу предложения зрелости: без пересчёта баннер показывает устаревшее
    from app.services.hypothesis_evidence import recompute_suggestion
    await recompute_suggestion(db, hyp)
    if status_changed:
        await emit_event(db, type="status_changed", actor_id=user.id, entity_type="hypothesis",
                          entity_id=eid, lab_id=hyp.lab_id, visibility=hyp.visibility,
                          meta={"old_status": old_status, "new_status": body.status})
    await _set_tags(db, user.id, eid, body.tags)
    await db.commit()
    await db.refresh(hyp)
    background_tasks.add_task(run_entity_postprocessing_background, user.id, "hypothesis", eid, f"{body.name}. {body.description}")
    h = HypOut.model_validate(hyp)
    h.tags = body.tags
    return h


@router.get("/{eid}/maturity-suggestion", response_model=MaturitySuggestionOut | None)
async def get_maturity_suggestion(eid: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    hyp = (await db.execute(select(Hypothesis).where(Hypothesis.id == eid, Hypothesis.user_id == user.id, Hypothesis.deleted_at.is_(None)))).scalar_one_or_none()
    if not hyp:
        raise HTTPException(404, "Не найдено")
    sug = (await db.execute(
        select(MaturitySuggestion).where(MaturitySuggestion.hypothesis_id == eid, MaturitySuggestion.status == "pending")
    )).scalar_one_or_none()
    return MaturitySuggestionOut.model_validate(sug) if sug else None


@router.get("/{eid}/maturity-progress")
async def get_maturity_progress(eid: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Сколько сигнала накоплено и сколько нужно до следующего уровня зрелости. Только владелец (как баннер).
    Числа берутся из maturity_signal, той же функции, что считает предложение: отдельной формулы нет."""
    from app.services.hypothesis_evidence import (
        maturity_signal, level_from_signal, risk_multiplier, BASE_THRESHOLDS, lab_total_signal)
    from app.services.link_effect import can_see_lab_effect
    hyp = (await db.execute(select(Hypothesis).where(Hypothesis.id == eid, Hypothesis.deleted_at.is_(None)))).scalar_one_or_none()
    personal = bool(hyp and hyp.user_id == user.id)
    # владелец видит всё; участник лаборатории только лабораторную часть (личный сигнал владельца ему не отдаётся)
    if not hyp or not (personal or await can_see_lab_effect(db, user.id, hyp)):
        raise HTTPException(404, "Не найдено")
    pred, obs, lab, total = await maturity_signal(db, hyp) if personal else (None, None, None, None)
    level = hyp.maturity or 0
    nxt = level + 1 if level + 1 < len(BASE_THRESHOLDS) else None
    return {
        "pred_signal": pred, "obs_signal": obs, "lab_signal": lab, "total_signal": total,
        "lab_total": await lab_total_signal(db, hyp),
        "maturity": level, "next_level": nxt,
        "next_threshold": BASE_THRESHOLDS[nxt] * risk_multiplier(hyp.risk) if nxt is not None else None,
        "signal_level": level_from_signal(total, hyp.risk) if personal else None,
    }


@router.post("/{eid}/maturity-suggestion/accept", response_model=HypOut)
async def accept_maturity_suggestion(eid: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    hyp = (await db.execute(select(Hypothesis).where(Hypothesis.id == eid, Hypothesis.user_id == user.id, Hypothesis.deleted_at.is_(None)))).scalar_one_or_none()
    if not hyp:
        raise HTTPException(404, "Не найдено")
    sug = (await db.execute(
        select(MaturitySuggestion).where(MaturitySuggestion.hypothesis_id == eid, MaturitySuggestion.status == "pending")
    )).scalar_one_or_none()
    if not sug:
        raise HTTPException(404, "Нет активного предложения")
    hyp.maturity = sug.suggested_level
    sug.status = "accepted"
    await db.commit()
    await db.refresh(hyp)
    h = HypOut.model_validate(hyp)
    h.tags = await _get_tags(db, user.id, eid)
    return h


@router.post("/{eid}/maturity-suggestion/dismiss", status_code=204)
async def dismiss_maturity_suggestion(eid: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    hyp = (await db.execute(select(Hypothesis).where(Hypothesis.id == eid, Hypothesis.user_id == user.id, Hypothesis.deleted_at.is_(None)))).scalar_one_or_none()
    if not hyp:
        raise HTTPException(404, "Не найдено")
    sug = (await db.execute(
        select(MaturitySuggestion).where(MaturitySuggestion.hypothesis_id == eid, MaturitySuggestion.status == "pending")
    )).scalar_one_or_none()
    if sug:
        sug.status = "dismissed"
        await db.commit()


@router.delete("/{eid}", status_code=204)
async def delete_hyp(eid: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    hyp = (await db.execute(select(Hypothesis).where(Hypothesis.id == eid, Hypothesis.user_id == user.id, Hypothesis.deleted_at.is_(None)))).scalar_one_or_none()
    if not hyp:
        raise HTTPException(404, "Не найдено")
    # Soft-delete: запись уходит в корзину владельца и хранится бессрочно.
    # Физическое удаление + каскад PR A — только DELETE /{entity_type}/{id}/permanent (trash.py).
    await soft_delete_entity(db, "hypothesis", hyp, user)
