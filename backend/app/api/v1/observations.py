from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, or_
from app.db.session import get_db
from app.core.deps import get_current_user, get_current_user_optional
from app.models.user import User
from app.models.entities import Observation, Tag, EntityTag, EntityReflection, EntityReflectionInsight
from app.schemas.entities import (
    ObsCreate, ObsUpdate, ObsOut,
    PredictionReflectionCreate, PredictionReflectionOut, PredictionReflectionInsightOut,
)
from app.core.slug import unique_slug_for
from app.core.lab_access import entity_visibility_filter, resolve_lab_attachment, get_entity_for_read, opened_via_link_condition, lab_scope_condition
from app.services.entity_postprocess import run_entity_postprocessing_background
from app.services.owner_info import attach_owner_info
from app.services.access_info import attach_access
from app.services.events import emit_event
from app.services.ai import diff_reflections, generate_reflection_question
from app.services.entity_access import require_owned_entity
from datetime import datetime, timezone
from typing import List, Optional

from app.services.soft_delete import soft_delete_entity
router = APIRouter(prefix="/observations", tags=["observations"])


async def _get_tags(db: AsyncSession, user_id: int, etype: str, eid: int) -> List[str]:
    result = await db.execute(
        select(Tag.name)
        .join(EntityTag, EntityTag.tag_id == Tag.id)
        .where(EntityTag.entity_type == etype, EntityTag.entity_id == eid, Tag.user_id == user_id)
    )
    return [r[0] for r in result.fetchall()]


async def _set_tags(db: AsyncSession, user_id: int, etype: str, eid: int, tags: List[str]):
    await db.execute(delete(EntityTag).where(EntityTag.entity_type == etype, EntityTag.entity_id == eid))
    for name in set(t.strip().lower() for t in tags if t.strip()):
        tag = (await db.execute(select(Tag).where(Tag.user_id == user_id, Tag.name == name))).scalar_one_or_none()
        if not tag:
            tag = Tag(user_id=user_id, name=name)
            db.add(tag)
            await db.flush()
        db.add(EntityTag(entity_type=etype, entity_id=eid, tag_id=tag.id))
    await db.commit()


@router.get("/", response_model=List[ObsOut])
async def list_obs(
    tag: Optional[str] = None,
    author: Optional[str] = None,
    lab_id: Optional[int] = None,
    include_opened: bool = False,
    user: Optional[User] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    user_id = user.id if user else None
    visible = entity_visibility_filter(Observation, user_id, lab_id=lab_id)
    if user_id is not None:
        visible = or_(visible, opened_via_link_condition(Observation, "observation", user_id))  # запись, открытая через связь
    q = select(Observation).where(visible)
    q = q.where(Observation.deleted_at.is_(None))  # корзину режем явно, как и в остальных списках
    if lab_id is not None:
        q = q.where(lab_scope_condition(Observation, "observation", user_id, lab_id, include_opened=include_opened))
    if author:
        q = q.where(Observation.author == author)
    if tag:
        q = q.join(EntityTag, (EntityTag.entity_type == "observation") & (EntityTag.entity_id == Observation.id))
        q = q.join(Tag, (Tag.id == EntityTag.tag_id) & (Tag.name == tag) & (Tag.user_id == user_id))
    q = q.order_by(Observation.date.desc(), Observation.id.desc())
    rows = (await db.execute(q)).scalars().all()
    out = []
    for r in rows:
        o = ObsOut.model_validate(r)
        # Теги — личная организация владельца; для гостя/чужих записей не
        # заводим лишний запрос с бессмысленным user_id=None.
        o.tags = await _get_tags(db, user_id, "observation", r.id) if user_id is not None else []
        out.append(o)
    await attach_owner_info(db, out)
    await attach_access(db, out, user_id)
    return out


@router.post("/", response_model=ObsOut, status_code=201)
async def create_obs(
    body: ObsCreate,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    slug_source = body.title
    slug = await unique_slug_for(db, Observation, slug_source)
    visibility = await resolve_lab_attachment(db, body.lab_id, body.visibility, user.id)
    obs = Observation(user_id=user.id, date=body.date, author=body.author, title=body.title, slug=slug, text=body.text, status=body.status, importance=body.importance, visibility=visibility, lab_id=body.lab_id)
    db.add(obs)
    await db.flush()
    await _set_tags(db, user.id, "observation", obs.id, body.tags)
    await emit_event(db, type="created", actor_id=user.id, entity_type="observation",
                      entity_id=obs.id, lab_id=obs.lab_id, visibility=obs.visibility)
    await db.commit()
    await db.refresh(obs)
    # Фон, ПОСЛЕ коммита: эмбеддинг + classify_fact_or_interpretation + implicit-проверка
    # открытых вопросов — раньше эмбеддинг и classify звались синхронно здесь и держали
    # пользователя на двух последовательных походах в Ollama (баг найден и исправлен 27.09,
    # см. services/entity_postprocess.py).
    background_tasks.add_task(run_entity_postprocessing_background, user.id, "observation", obs.id, body.text)
    o = ObsOut.model_validate(obs)
    o.tags = body.tags
    return o


@router.get("/{eid}", response_model=ObsOut)
async def get_obs(eid: str, user: Optional[User] = Depends(get_current_user_optional), db: AsyncSession = Depends(get_db)):
    cond = (Observation.id == int(eid)) if eid.isdigit() else (Observation.slug == eid)
    obs = (await db.execute(select(Observation).where(cond))).scalar_one_or_none()
    if not obs:
        raise HTTPException(404, "Не найдено")
    # Гость (user=None) может получить только публичную запись — see
    # get_entity_for_view: непубличная сущность даст 403, что фронт
    # отличает от 401 ("нет сессии вообще") и показывает разный UI.
    obs = await get_entity_for_read(db, Observation, obs.id, user.id if user else None)
    o = ObsOut.model_validate(obs)
    o.tags = await _get_tags(db, user.id if user else None, "observation", obs.id)
    await attach_owner_info(db, [o])
    await attach_access(db, [o], user.id if user else None)
    return o


@router.put("/{eid}", response_model=ObsOut)
async def update_obs(eid: int, body: ObsUpdate, background_tasks: BackgroundTasks, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    obs = (await db.execute(select(Observation).where(Observation.id == eid, Observation.user_id == user.id, Observation.deleted_at.is_(None)))).scalar_one_or_none()
    if not obs:
        raise HTTPException(404, "Не найдено")
    status_changed = obs.status != body.status
    old_status = obs.status
    from app.core.lab_access import reset_shares_on_visibility_change
    _new_vis = await resolve_lab_attachment(db, body.lab_id, body.visibility, user.id)
    await reset_shares_on_visibility_change(db, "observation", obs, _new_vis, body.lab_id, actor_id=user.id)
    obs.date = body.date
    obs.author = body.author
    obs.title = body.title
    obs.text = body.text
    obs.status = body.status
    # Значимость — единственное поле с частичным PUT: не прислали — не трогаем,
    # прислали null — «не оценено». Остальные поля, как и раньше, заменяются целиком.
    if "importance" in body.model_fields_set:
        obs.importance = body.importance
    obs.visibility = _new_vis
    obs.lab_id = body.lab_id
    from app.services.hypothesis_evidence import recompute_for_observation
    await recompute_for_observation(db, eid)  # важность/лаборатория изменились: предложения связанных гипотез устарели
    if status_changed:
        await emit_event(db, type="status_changed", actor_id=user.id, entity_type="observation",
                          entity_id=eid, lab_id=obs.lab_id, visibility=obs.visibility,
                          meta={"old_status": old_status, "new_status": body.status})
    await _set_tags(db, user.id, "observation", eid, body.tags)
    await db.commit()
    await db.refresh(obs)
    # Фон, ПОСЛЕ коммита — см. комментарий в create_obs.
    background_tasks.add_task(run_entity_postprocessing_background, user.id, "observation", eid, body.text)
    o = ObsOut.model_validate(obs)
    o.tags = body.tags
    return o


@router.delete("/{eid}", status_code=204)
async def delete_obs(eid: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    obs = (await db.execute(select(Observation).where(Observation.id == eid, Observation.user_id == user.id, Observation.deleted_at.is_(None)))).scalar_one_or_none()
    if not obs:
        raise HTTPException(404, "Не найдено")
    # Soft-delete: запись уходит в корзину владельца и хранится бессрочно.
    # Физическое удаление + каскад PR A — только DELETE /{entity_type}/{id}/permanent (trash.py).
    await soft_delete_entity(db, "observation", obs, user)


# ── Рефлексия ────────────────────────────────────────────────────────────
# Тот же паттерн, что у Worldview: у Observation нет стадии "резолюции",
# только "creation", сравнение — первая/последняя версия факторов.

@router.post("/{eid}/reflections", response_model=PredictionReflectionOut, status_code=201)
async def create_obs_reflection(eid: int, body: PredictionReflectionCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    obs = await require_owned_entity(db, "observation", eid, user)
    refl = EntityReflection(
        entity_type="observation", entity_id=obs.id,
        stage="creation",
        factors=[f.model_dump() for f in body.factors],
        raw_dialogue_text=body.raw_dialogue_text,
        created_at=datetime.now(timezone.utc),
    )
    db.add(refl)
    await db.commit()
    await db.refresh(refl)
    return PredictionReflectionOut.model_validate(refl)


@router.get("/{eid}/reflections", response_model=List[PredictionReflectionOut])
async def list_obs_reflections(eid: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    obs = await require_owned_entity(db, "observation", eid, user)
    rows = (await db.execute(
        select(EntityReflection)
        .where(EntityReflection.entity_type == "observation", EntityReflection.entity_id == eid)
        .order_by(EntityReflection.created_at)
    )).scalars().all()
    return [PredictionReflectionOut.model_validate(r) for r in rows]


@router.post("/{eid}/reflections/insights/manual", response_model=PredictionReflectionInsightOut)
async def manual_obs_insight(eid: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    obs = await require_owned_entity(db, "observation", eid, user)
    rows = (await db.execute(
        select(EntityReflection)
        .where(EntityReflection.entity_type == "observation", EntityReflection.entity_id == eid)
        .order_by(EntityReflection.created_at)
    )).scalars().all()
    if len(rows) < 2:
        raise HTTPException(400, "Недостаточно версий факторов для сравнения — измени их хотя бы раз после создания.")
    earliest, latest = rows[0], rows[-1]
    result = await diff_reflections(earliest.factors, latest.factors, prediction_text=obs.text)
    insight = EntityReflectionInsight(
        entity_type="observation", entity_id=eid,
        matched=result["matched"], added=result["added"], dropped=result["dropped"],
        insight=result["insight"], triggered_by="manual",
    )
    db.add(insight)
    await db.commit()
    await db.refresh(insight)
    return PredictionReflectionInsightOut.model_validate(insight)


@router.get("/{eid}/reflections/insights", response_model=List[PredictionReflectionInsightOut])
async def list_obs_insights(eid: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    obs = await require_owned_entity(db, "observation", eid, user)
    rows = (await db.execute(
        select(EntityReflectionInsight)
        .where(EntityReflectionInsight.entity_type == "observation", EntityReflectionInsight.entity_id == eid)
        .order_by(EntityReflectionInsight.created_at.desc())
    )).scalars().all()
    return [PredictionReflectionInsightOut.model_validate(r) for r in rows]


@router.post("/{eid}/reflections/insights/{insight_id}/question")
async def obs_reflection_question(eid: int, insight_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    obs = await require_owned_entity(db, "observation", eid, user)
    insight = (await db.execute(
        select(EntityReflectionInsight).where(
            EntityReflectionInsight.id == insight_id,
            EntityReflectionInsight.entity_type == "observation",
            EntityReflectionInsight.entity_id == eid,
        )
    )).scalar_one_or_none()
    if not insight:
        raise HTTPException(404, "Инсайт не найден")
    question = await generate_reflection_question(insight.insight)
    return {"question": question}
