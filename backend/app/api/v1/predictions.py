from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, or_, case
from app.core.prediction_status import CLOSED_PREDICTION_STATUSES
from app.db.session import get_db
from app.core.deps import get_current_user, get_current_user_optional
from app.models.user import User
from app.models.entities import Prediction, Hypothesis, EntityReflection, EntityReflectionInsight
from app.services.hypothesis_evidence import process_prediction_close
from app.schemas.entities import PredCreate, PredUpdate, PredOut, PredClose, PredictionReflectionCreate, PredictionReflectionOut, PredictionReflectionInsightOut
from app.core.slug import unique_slug_for
from app.core.lab_access import get_entity_for_read, entity_visibility_filter, opened_via_link_or_never, can_link, resolve_lab_attachment, require_publication_consent, grant_publication, ShareChoice, lab_scope_condition, ensure_prediction_visibility_not_frozen
from app.services.owner_info import attach_owner_info
from app.services.access_info import attach_access
from app.services.events import emit_event
from app.services.entity_postprocess import run_entity_postprocessing_background
from typing import List, Optional
from datetime import datetime, timezone
from app.services.prediction_reflections import run_manual_diff, run_resolution_diff
from app.services.ai import generate_reflection_question
from app.services.entity_access import require_owned_entity
from app.services.prediction_reflections import _get_image_descriptions

from app.services.soft_delete import soft_delete_entity
router = APIRouter(prefix="/predictions", tags=["predictions"])


@router.get("/", response_model=List[PredOut])
async def list_preds(
    status: Optional[str] = None,
    hypothesis_id: Optional[int] = None,
    lab_id: Optional[int] = None,
    mine: bool = False,
    include_opened: bool = False,
    user: Optional[User] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    user_id = user.id if user else None
    if mine and user_id is None:
        raise HTTPException(status_code=401, detail="Требуется авторизация")
    q = (
        select(
            Prediction,
            case((entity_visibility_filter(Hypothesis, user_id), Hypothesis.name), else_=None).label("hyp_name"),
        )
        .outerjoin(Hypothesis, Hypothesis.id == Prediction.hypothesis_id)
        .where(or_(entity_visibility_filter(Prediction, user_id, lab_id=lab_id), opened_via_link_or_never(Prediction, "prediction", user_id)))
        .where(Prediction.deleted_at.is_(None))  # корзину режем явно
    )
    # mine — доп. сужение поверх visibility-фильтра (never расширяет доступ):
    # для персональных виджетов вроде очереди проверки, где чужие публичные
    # прогнозы не должны попадать в список независимо от их видимости
    if mine:
        q = q.where(Prediction.user_id == user_id)
    if lab_id is not None:
        q = q.where(lab_scope_condition(Prediction, "prediction", user_id, lab_id, include_opened=include_opened))
    if status:
        q = q.where(Prediction.status == status)
    if hypothesis_id:
        q = q.where(Prediction.hypothesis_id == hypothesis_id)
    q = q.order_by(Prediction.date_created.desc())
    rows = (await db.execute(q)).all()
    out = []
    for pred, hyp_name in rows:
        p = PredOut.model_validate(pred)
        p.hyp_name = hyp_name
        out.append(p)
    await attach_owner_info(db, out)
    await attach_access(db, out, user_id)
    return out


@router.post("/", response_model=PredOut, status_code=201)
async def create_pred(body: PredCreate, background_tasks: BackgroundTasks, share: ShareChoice = None, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if body.status in CLOSED_PREDICTION_STATUSES:
        # Закрытие — только /close: вклад прогноза в сигнал гипотезы считается там
        # (process_prediction_close), а прогноз, созданный сразу закрытым, в него никогда бы не попал.
        raise HTTPException(400, "Создать прогноз сразу закрытым нельзя: закройте его кнопкой проверки, иначе он не попадет в калибровку")
    slug_source = body.title.strip() if body.title and body.title.strip() else body.text[:60]
    slug = await unique_slug_for(db, Prediction, slug_source)
    # Единая точка входа для lab_id/visibility (как в observations.py/hypotheses.py) —
    # проверяет существование лабы и членство пользователя, сама выводит visibility
    # из lab.is_public. Раньше здесь был самодельный safe_lab_id, который НЕ проверял
    # членство — можно было указать чужой/приватный lab_id с visibility="lab" и получить
    # запись, видимую участникам чужой лабы. См. ACCESS_POLICY.md / документ п.1, п.19.
    visibility = await resolve_lab_attachment(db, body.lab_id, body.visibility, user.id)
    hyp = None
    if body.hypothesis_id:
        hyp = await can_link(db, Hypothesis, body.hypothesis_id, user.id)  # линк = публикация — гипотеза должна быть видна ДО создания записи
    pred = Prediction(
        user_id=user.id, title=body.title, slug=slug, text=body.text,
        date_created=body.date_created, expected_check_date=body.expected_check_date,
        hypothesis_id=body.hypothesis_id, status=body.status, confidence=body.confidence,
        result_notes=body.result_notes, visibility=visibility, lab_id=body.lab_id,
        confirms_hypothesis_if_true=body.confirms_hypothesis_if_true,  # раньше терялось: стресс-тест создавался обычным
    )
    if hyp is not None:   # прогноз с лабораторной гипотезой может открыть сам себя лаборатории
        impacts = await require_publication_consent(db, ("prediction", pred), ("hypothesis", hyp), user.id, share)
    db.add(pred)
    await db.flush()
    if hyp is not None:
        await grant_publication(db, impacts, user.id, new_id=pred.id)
    await emit_event(db, type="created", actor_id=user.id, entity_type="prediction",
                      entity_id=pred.id, lab_id=pred.lab_id, visibility=pred.visibility)
    await db.commit()
    await db.refresh(pred)
    background_tasks.add_task(run_entity_postprocessing_background, user.id, "prediction", pred.id, body.text)
    p = PredOut.model_validate(pred)
    if hyp:
        p.hyp_name = hyp.name
    return p


@router.get("/{eid}", response_model=PredOut)
async def get_pred(eid: str, user: Optional[User] = Depends(get_current_user_optional), db: AsyncSession = Depends(get_db)):
    cond = (Prediction.id == int(eid)) if eid.isdigit() else (Prediction.slug == eid)
    view_user_id = user.id if user else None
    row = (await db.execute(
        select(
            Prediction,
            case((entity_visibility_filter(Hypothesis, view_user_id), Hypothesis.name), else_=None).label("hyp_name"),
        )
        .outerjoin(Hypothesis, Hypothesis.id == Prediction.hypothesis_id)
        .where(cond)
    )).first()
    if not row:
        raise HTTPException(404, "Не найдено")
    pred = await get_entity_for_read(db, Prediction, row[0].id, user.id if user else None)
    p = PredOut.model_validate(pred)
    p.hyp_name = row[1]
    await attach_owner_info(db, [p])
    await attach_access(db, [p], user.id if user else None)
    return p


@router.put("/{eid}", response_model=PredOut)
async def update_pred(eid: int, body: PredUpdate, background_tasks: BackgroundTasks, share: ShareChoice = None, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    pred = (await db.execute(select(Prediction).where(Prediction.id == eid, Prediction.user_id == user.id, Prediction.deleted_at.is_(None)))).scalar_one_or_none()
    if not pred:
        raise HTTPException(404, "Не найдено")
    # Пропущенное клиентом поле остается как есть, а не сбрасывается к умолчанию схемы: раньше PUT
    # без confidence/visibility/lab_id/confirms_hypothesis_if_true молча обнулял их (так сохранял
    # DetailPanel.updateScale). Явно присланный null по-прежнему очищает поле.
    for name in ("title", "hypothesis_id", "status", "confidence", "result_notes",
                 "visibility", "lab_id", "confirms_hypothesis_if_true"):
        if name not in body.model_fields_set:
            setattr(body, name, getattr(pred, name))
    if pred.status in CLOSED_PREDICTION_STATUSES and body.hypothesis_id != pred.hypothesis_id:
        # Вклад закрытого прогноза уже влит в сигнал исходной гипотезы и не переносится: смена привязки
        # оставила бы вклад в старой гипотезе, а связь — в новой.
        raise HTTPException(400, "Нельзя менять гипотезу закрытого прогноза: его исход уже учтен в сигнале гипотезы")
    ensure_prediction_visibility_not_frozen(pred, body.visibility, body.lab_id)   # лаборатория и видимость закрытого заморожены
    if body.hypothesis_id and body.hypothesis_id != pred.hypothesis_id:
        new_hyp = await can_link(db, Hypothesis, body.hypothesis_id, user.id)  # линк = публикация — то же правило, что при создании
        vis_before = pred.visibility
        impacts = await require_publication_consent(db, ("prediction", pred), ("hypothesis", new_hyp), user.id, share)
        if pred.visibility != vis_before:   # share=public опубликовал прогноз этой связью: body.visibility не должен вернуть его назад
            body.visibility = pred.visibility
        await grant_publication(db, impacts, user.id)
    if pred.status in CLOSED_PREDICTION_STATUSES and body.confidence != pred.confidence:
        # Вклад в сигнал гипотезы посчитан по confidence на момент закрытия и не пересчитывается,
        # а калибровка читает confidence живьем — правка задним числом позволяла бы «улучшить»
        # уверенность, зная исход.
        raise HTTPException(400, "Нельзя менять уверенность закрытого прогноза: она уже учтена в калибровке")
    if body.status != pred.status and (body.status in CLOSED_PREDICTION_STATUSES or pred.status in CLOSED_PREDICTION_STATUSES):
        # Закрытие, переоткрытие и смена исхода через PUT обходили бы process_prediction_close (вклад в
        # сигнал гипотезы считается только в /close и вычитать не умеет) — сигнал гипотезы и статус
        # прогноза разошлись бы молча.
        raise HTTPException(400, "Закрыть прогноз можно только кнопкой закрытия; исход закрытого прогноза изменить нельзя")
    status_changed = pred.status != body.status
    old_status = pred.status
    from app.core.lab_access import reset_shares_on_visibility_change
    _new_vis = await resolve_lab_attachment(db, body.lab_id, body.visibility, user.id)
    await reset_shares_on_visibility_change(db, "prediction", pred, _new_vis, body.lab_id, actor_id=user.id)
    pred.title = body.title
    pred.text = body.text
    pred.date_created = body.date_created
    pred.expected_check_date = body.expected_check_date
    pred.hypothesis_id = body.hypothesis_id
    pred.status = body.status
    pred.confidence = body.confidence
    pred.result_notes = body.result_notes
    pred.visibility = _new_vis
    pred.lab_id = body.lab_id
    if status_changed:
        await emit_event(db, type="status_changed", actor_id=user.id, entity_type="prediction",
                          entity_id=eid, lab_id=pred.lab_id, visibility=pred.visibility,
                          meta={"old_status": old_status, "new_status": body.status})
    if pred.confirms_hypothesis_if_true != body.confirms_hypothesis_if_true and pred.hypothesis_id:
        from app.services.evidence_diversity import invalidate_evidence_diversity
        hyp = await db.get(Hypothesis, pred.hypothesis_id)
        if hyp:
            invalidate_evidence_diversity(hyp)
    pred.confirms_hypothesis_if_true = body.confirms_hypothesis_if_true
    await db.commit()
    await db.refresh(pred)
    background_tasks.add_task(run_entity_postprocessing_background, user.id, "prediction", eid, body.text)
    return PredOut.model_validate(pred)


@router.put("/{eid}/close", response_model=PredOut)
async def close_pred(eid: int, body: PredClose, background_tasks: BackgroundTasks, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Закрыть прогноз из очереди проверки — меняет только статус и комментарий к исходу.

    Единственный путь закрытия: только открытый прогноз и только в закрытый статус. Вклад в
    сигнал гипотезы (process_prediction_close) копится прибавлением и вычесть его нечем —
    повторное закрытие засчитало бы прогноз дважды, а «закрытие» открытым статусом стало бы
    переоткрытием без отката. Строка блокируется,
    чтобы два параллельных запроса не прошли проверку одновременно."""
    pred = (await db.execute(
        select(Prediction).where(Prediction.id == eid, Prediction.user_id == user.id,
                                 Prediction.deleted_at.is_(None)).with_for_update()
    )).scalar_one_or_none()
    if not pred:
        raise HTTPException(404, "Не найдено")
    if body.status not in CLOSED_PREDICTION_STATUSES:
        raise HTTPException(400, "Закрыть прогноз можно только исходом: подтвердился, частично подтвердился или не подтвердился")
    if pred.status in CLOSED_PREDICTION_STATUSES:
        raise HTTPException(409, "Прогноз уже закрыт — исход закрытого прогноза изменить нельзя")
    status_changed = pred.status != body.status
    old_status = pred.status
    pred.status = body.status
    pred.result_notes = body.result_notes
    if status_changed:
        await emit_event(db, type="status_changed", actor_id=user.id, entity_type="prediction",
                          entity_id=eid, lab_id=pred.lab_id, visibility=pred.visibility,
                          meta={"old_status": old_status, "new_status": body.status})
    await process_prediction_close(db, pred, user.id)
    if pred.hypothesis_id:
        from app.services.evidence_diversity import invalidate_evidence_diversity
        hyp = await db.get(Hypothesis, pred.hypothesis_id)
        if hyp:
            invalidate_evidence_diversity(hyp)
    await db.commit()
    await db.refresh(pred)
    background_tasks.add_task(run_resolution_diff, pred.id)
    p = PredOut.model_validate(pred)
    if pred.hypothesis_id:
        hyp = (await db.execute(
            select(Hypothesis).where(Hypothesis.id == pred.hypothesis_id, entity_visibility_filter(Hypothesis, user.id))
        )).scalar_one_or_none()
        p.hyp_name = hyp.name if hyp else None
    return p


@router.delete("/{eid}", status_code=204)
async def delete_pred(eid: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    pred = (await db.execute(select(Prediction).where(Prediction.id == eid, Prediction.user_id == user.id, Prediction.deleted_at.is_(None)))).scalar_one_or_none()
    if not pred:
        raise HTTPException(404, "Не найдено")
    # Soft-delete: запись уходит в корзину владельца и хранится бессрочно.
    # Физическое удаление + каскад PR A — только DELETE /{entity_type}/{id}/permanent (trash.py).
    await soft_delete_entity(db, "prediction", pred, user)


@router.post("/{eid}/reflections", response_model=PredictionReflectionOut, status_code=201)
async def create_reflection(eid: int, body: PredictionReflectionCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Сохраняет снимок факторов на стадии creation/resolution. Append-only —
    не апдейтит предыдущие записи, история пересмотров хранится вся."""
    pred = await require_owned_entity(db, "prediction", eid, user)
    refl = EntityReflection(
        entity_type="prediction", entity_id=pred.id,
        stage=body.stage,
        factors=[f.model_dump() for f in body.factors],
        raw_dialogue_text=body.raw_dialogue_text,
        created_at=datetime.now(timezone.utc),
    )
    db.add(refl)
    await db.commit()
    await db.refresh(refl)
    return PredictionReflectionOut.model_validate(refl)


@router.get("/{eid}/reflections", response_model=List[PredictionReflectionOut])
async def list_reflections(eid: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Полная история рефлексий по прогнозу, старые записи не скрываются —
    фронт сам решает, что показывать как 'текущее' на каждой стадии."""
    pred = await require_owned_entity(db, "prediction", eid, user)
    rows = (await db.execute(
        select(EntityReflection)
        .where(EntityReflection.entity_type == "prediction", EntityReflection.entity_id == eid)
        .order_by(EntityReflection.created_at)
    )).scalars().all()
    return [PredictionReflectionOut.model_validate(r) for r in rows]


@router.post("/{eid}/reflections/insights/manual", response_model=PredictionReflectionInsightOut)
async def manual_insight(eid: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Кнопка 'промежуточный результат' — синхронный вызов, пользователь ждет ответ.
    Сравнивает первую и последнюю версию факторов на стадии creation."""
    pred = await require_owned_entity(db, "prediction", eid, user)
    insight = await run_manual_diff(db, eid)
    if not insight:
        raise HTTPException(400, "Недостаточно версий факторов для сравнения — измени их хотя бы раз после создания.")
    return PredictionReflectionInsightOut.model_validate(insight)


@router.get("/{eid}/reflections/insights", response_model=List[PredictionReflectionInsightOut])
async def list_insights(eid: int, triggered_by: Optional[str] = None, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Используется фронтом для poll'инга после close_pred — авто-diff при
    резолюции считается в фоне (BackgroundTasks), и на момент ответа close
    его еще может не быть готово."""
    pred = await require_owned_entity(db, "prediction", eid, user)
    q = select(EntityReflectionInsight).where(EntityReflectionInsight.entity_type == "prediction", EntityReflectionInsight.entity_id == eid)
    if triggered_by:
        q = q.where(EntityReflectionInsight.triggered_by == triggered_by)
    q = q.order_by(EntityReflectionInsight.created_at.desc())
    rows = (await db.execute(q)).scalars().all()
    return [PredictionReflectionInsightOut.model_validate(r) for r in rows]


@router.post("/{eid}/reflections/insights/{insight_id}/question")
async def reflection_followup_question(eid: int, insight_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Один наводящий вопрос по уже посчитанному инсайту — ответ пользователь
    сохраняет отдельно как обычный комментарий (см. /comments), не сюда."""
    pred = await require_owned_entity(db, "prediction", eid, user)
    insight = (await db.execute(
        select(EntityReflectionInsight).where(
            EntityReflectionInsight.id == insight_id,
            EntityReflectionInsight.entity_type == "prediction",
            EntityReflectionInsight.entity_id == eid,
        )
    )).scalar_one_or_none()
    if not insight:
        raise HTTPException(404, "Инсайт не найден")
    images = await _get_image_descriptions(db, eid)
    question = await generate_reflection_question(insight.insight, image_descriptions=images)
    return {"question": question}
