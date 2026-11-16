from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, or_
from app.db.session import get_db
from app.core.deps import get_current_user, get_current_user_optional
from app.models.user import User
from app.models.entities import Worldview, Tag, EntityTag, EntityReflection, EntityReflectionInsight
from app.services.events import emit_event
from app.schemas.entities import (
    WvCreate, WvUpdate, WvOut,
    PredictionReflectionCreate, PredictionReflectionOut, PredictionReflectionInsightOut,
)
from app.core.slug import unique_slug_for
from app.core.lab_access import get_entity_for_read, entity_visibility_filter, opened_via_link_or_never, resolve_lab_attachment
from app.services.owner_info import attach_owner_info
from app.services.access_info import attach_access
from app.services.ai import diff_reflections, generate_reflection_question
from app.services.entity_postprocess import run_entity_postprocessing_background
from app.services.entity_access import require_owned_entity
from datetime import datetime, timezone
from typing import List, Optional

from app.services.soft_delete import soft_delete_entity
router = APIRouter(prefix="/worldview", tags=["worldview"])


async def _get_tags(db, user_id, eid):
    r = await db.execute(
        select(Tag.name).join(EntityTag, EntityTag.tag_id == Tag.id)
        .where(EntityTag.entity_type == "worldview", EntityTag.entity_id == eid, Tag.user_id == user_id)
    )
    return [x[0] for x in r.fetchall()]


async def _set_tags(db, user_id, eid, tags):
    await db.execute(delete(EntityTag).where(EntityTag.entity_type == "worldview", EntityTag.entity_id == eid))
    for name in set(t.strip().lower() for t in tags if t.strip()):
        tag = (await db.execute(select(Tag).where(Tag.user_id == user_id, Tag.name == name))).scalar_one_or_none()
        if not tag:
            tag = Tag(user_id=user_id, name=name)
            db.add(tag)
            await db.flush()
        db.add(EntityTag(entity_type="worldview", entity_id=eid, tag_id=tag.id))
    await db.commit()


@router.get("/", response_model=List[WvOut])
async def list_wv(
    status: Optional[str] = None,
    user: Optional[User] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    user_id = user.id if user else None
    q = select(Worldview).where(or_(entity_visibility_filter(Worldview, user_id), opened_via_link_or_never(Worldview, "worldview", user_id)))
    q = q.where(Worldview.deleted_at.is_(None))  # корзину режем явно
    if status:
        q = q.where(Worldview.status == status)
    q = q.order_by(Worldview.date.desc())
    rows = (await db.execute(q)).scalars().all()
    out = []
    for r in rows:
        w = WvOut.model_validate(r)
        w.tags = await _get_tags(db, user_id, r.id) if user_id is not None else []
        out.append(w)
    await attach_owner_info(db, out)
    await attach_access(db, out, user_id)
    return out


@router.post("/", response_model=WvOut, status_code=201)
async def create_wv(body: WvCreate, background_tasks: BackgroundTasks, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    slug = await unique_slug_for(db, Worldview, body.belief[:60])
    visibility = await resolve_lab_attachment(db, body.lab_id, body.visibility, user.id)
    wv = Worldview(
        user_id=user.id, date=body.date, belief=body.belief, slug=slug,
        status=body.status, confirming_data=body.confirming_data,
        refuting_data=body.refuting_data,
        visibility=visibility, lab_id=body.lab_id,
    )
    db.add(wv)
    await db.flush()
    await _set_tags(db, user.id, wv.id, body.tags)
    await emit_event(db, type="created", actor_id=user.id, entity_type="worldview",
                      entity_id=wv.id, lab_id=wv.lab_id, visibility=wv.visibility)
    await db.commit()
    await db.refresh(wv)
    background_tasks.add_task(run_entity_postprocessing_background, user.id, "worldview", wv.id, body.belief)
    w = WvOut.model_validate(wv)
    w.tags = body.tags
    return w


@router.get("/{eid}", response_model=WvOut)
async def get_wv(eid: str, user: Optional[User] = Depends(get_current_user_optional), db: AsyncSession = Depends(get_db)):
    cond = (Worldview.id == int(eid)) if eid.isdigit() else (Worldview.slug == eid)
    wv = (await db.execute(select(Worldview).where(cond))).scalar_one_or_none()
    if not wv:
        raise HTTPException(404, "Не найдено")
    wv = await get_entity_for_read(db, Worldview, wv.id, user.id if user else None)
    w = WvOut.model_validate(wv)
    w.tags = await _get_tags(db, user.id if user else None, wv.id)
    await attach_owner_info(db, [w])
    await attach_access(db, [w], user.id if user else None)
    return w


@router.put("/{eid}", response_model=WvOut)
async def update_wv(eid: int, body: WvUpdate, background_tasks: BackgroundTasks, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    wv = (await db.execute(select(Worldview).where(Worldview.id == eid, Worldview.user_id == user.id, Worldview.deleted_at.is_(None)))).scalar_one_or_none()
    if not wv:
        raise HTTPException(404, "Не найдено")
    old_status = wv.status
    from app.core.lab_access import reset_shares_on_visibility_change
    _new_vis = await resolve_lab_attachment(db, body.lab_id, body.visibility, user.id)
    await reset_shares_on_visibility_change(db, "worldview", wv, _new_vis, body.lab_id, actor_id=user.id)
    wv.date = body.date
    wv.belief = body.belief
    wv.status = body.status
    wv.confirming_data = body.confirming_data
    wv.refuting_data = body.refuting_data
    wv.confidence = body.confidence
    wv.visibility = _new_vis
    wv.lab_id = body.lab_id
    if body.status != old_status:
        await emit_event(db, type="status_changed", actor_id=user.id, entity_type="worldview",
                          entity_id=eid, lab_id=wv.lab_id, visibility=wv.visibility,
                          meta={"old_status": old_status, "new_status": body.status})
    await _set_tags(db, user.id, eid, body.tags)
    await db.commit()
    await db.refresh(wv)
    background_tasks.add_task(run_entity_postprocessing_background, user.id, "worldview", eid, body.belief)
    w = WvOut.model_validate(wv)
    w.tags = body.tags
    return w


@router.delete("/{eid}", status_code=204)
async def delete_wv(eid: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    wv = (await db.execute(select(Worldview).where(Worldview.id == eid, Worldview.user_id == user.id, Worldview.deleted_at.is_(None)))).scalar_one_or_none()
    if not wv:
        raise HTTPException(404, "Не найдено")
    # Soft-delete: запись уходит в корзину владельца и хранится бессрочно.
    # Физическое удаление + каскад PR A — только DELETE /{entity_type}/{id}/permanent (trash.py).
    await soft_delete_entity(db, "worldview", wv, user)


# ── Рефлексия убеждений — переиспользует полиморфную инфраструктуру ────────
# У Worldview нет стадии "резолюции" (нет момента подведения итога, как у
# прогноза) — вся лента пересмотров хранится в одной стадии "creation",
# сравнение всегда первая/последняя версия (как run_manual_diff у прогнозов).
# Никакого BackgroundTask — нет авто-триггера при "закрытии", только ручной
# запрос пользователя.

@router.post("/{eid}/reflections", response_model=PredictionReflectionOut, status_code=201)
async def create_wv_reflection(eid: int, body: PredictionReflectionCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    wv = await require_owned_entity(db, "worldview", eid, user)
    refl = EntityReflection(
        entity_type="worldview", entity_id=wv.id,
        stage="creation",  # у Worldview всегда одна стадия — см. комментарий выше
        factors=[f.model_dump() for f in body.factors],
        raw_dialogue_text=body.raw_dialogue_text,
        created_at=datetime.now(timezone.utc),
    )
    db.add(refl)
    await db.commit()
    await db.refresh(refl)
    return PredictionReflectionOut.model_validate(refl)


@router.get("/{eid}/reflections", response_model=List[PredictionReflectionOut])
async def list_wv_reflections(eid: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    wv = await require_owned_entity(db, "worldview", eid, user)
    rows = (await db.execute(
        select(EntityReflection)
        .where(EntityReflection.entity_type == "worldview", EntityReflection.entity_id == eid)
        .order_by(EntityReflection.created_at)
    )).scalars().all()
    return [PredictionReflectionOut.model_validate(r) for r in rows]


@router.post("/{eid}/reflections/insights/manual", response_model=PredictionReflectionInsightOut)
async def manual_wv_insight(eid: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Сравнивает первую и последнюю версию факторов — как у прогнозов до
    резолюции, только это единственный режим для Worldview, не промежуточный."""
    wv = await require_owned_entity(db, "worldview", eid, user)
    rows = (await db.execute(
        select(EntityReflection)
        .where(EntityReflection.entity_type == "worldview", EntityReflection.entity_id == eid)
        .order_by(EntityReflection.created_at)
    )).scalars().all()
    if len(rows) < 2:
        raise HTTPException(400, "Недостаточно версий факторов для сравнения — измени их хотя бы раз после создания.")
    earliest, latest = rows[0], rows[-1]
    result = await diff_reflections(earliest.factors, latest.factors, prediction_text=wv.belief)
    insight = EntityReflectionInsight(
        entity_type="worldview", entity_id=eid,
        matched=result["matched"], added=result["added"], dropped=result["dropped"],
        insight=result["insight"], triggered_by="manual",
    )
    db.add(insight)
    await db.commit()
    await db.refresh(insight)
    return PredictionReflectionInsightOut.model_validate(insight)


@router.get("/{eid}/reflections/insights", response_model=List[PredictionReflectionInsightOut])
async def list_wv_insights(eid: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    wv = await require_owned_entity(db, "worldview", eid, user)
    rows = (await db.execute(
        select(EntityReflectionInsight)
        .where(EntityReflectionInsight.entity_type == "worldview", EntityReflectionInsight.entity_id == eid)
        .order_by(EntityReflectionInsight.created_at.desc())
    )).scalars().all()
    return [PredictionReflectionInsightOut.model_validate(r) for r in rows]


@router.post("/{eid}/reflections/insights/{insight_id}/question")
async def wv_reflection_question(eid: int, insight_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    wv = await require_owned_entity(db, "worldview", eid, user)
    insight = (await db.execute(
        select(EntityReflectionInsight).where(
            EntityReflectionInsight.id == insight_id,
            EntityReflectionInsight.entity_type == "worldview",
            EntityReflectionInsight.entity_id == eid,
        )
    )).scalar_one_or_none()
    if not insight:
        raise HTTPException(404, "Инсайт не найден")
    question = await generate_reflection_question(insight.insight)
    return {"question": question}
