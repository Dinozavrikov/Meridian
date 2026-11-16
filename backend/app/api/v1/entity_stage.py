"""Опциональная привязка сущности (или лабы) к одной из 8 фиксированных
платформенных стадий — см. докстринг app.models.entities.EntityStage.

Права: владелец сущности, ИЛИ (если entity_type=="lab") owner/admin в
LabMember этой лабы — Lab.owner_id всегда дублируется строкой LabMember
role="owner" при создании лабы (labs.py::create_lab), так что проверка
роли по LabMember покрывает и владельца лабы, отдельной проверки
Lab.owner_id не нужно.

Один идемпотентный PUT (upsert), не POST+PATCH — различие "начал
отслеживать"/"сменил стадию" для события определяется явным SELECT
ДО upsert (INSERT ... ON CONFLICT сам не сообщает, была ли строка раньше)."""
from app.schemas._strict import StrictIn, Short16, Short32, Short128, Short255, LongText
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel

from sqlalchemy import or_, false as sa_false
from app.db.session import get_db
from app.core.deps import get_current_user, get_current_user_optional
from app.core.entity_registry import STAGE_ENTITY_MODELS
from app.core.lab_access import _lab_role, entity_visibility_filter
from app.models.entities import EntityStage, STAGE_VALUES
from app.models.social import LabMember
from app.models.user import User
from app.services.events import emit_event
from typing import Optional

router = APIRouter(tags=["entity_stage"])

# Явный экстрактор заголовка per-type — НЕ единое поле title/name на всех
# моделях: Worldview.belief — это содержание убеждения, не заголовок,
# Hypothesis/ResearchTask/Lab называются через .name, остальные через
# .title. Унификация на уровне колонок БД — отдельная, гораздо более
# рискованная задача (переименование колонок в проде, правка сериализаторов
# и фронта для 6 типов), сознательно вне объёма PR B (обсуждено с Алексеем
# 23.09) — разное доменное моделирование сущностей, не архитектурный баг.
_TITLE_ATTR: dict[str, str] = {
    "observation": "title", "hypothesis": "name", "prediction": "title",
    "worldview": "belief", "question": "title", "task": "name", "lab": "name",
}


def _title_of(entity_type: str, obj) -> str:
    return getattr(obj, _TITLE_ATTR[entity_type], "")


class StageIn(StrictIn):
    stage: Short32


class StageOut(BaseModel):
    entity_type: str
    entity_id: int
    current_stage: str

    class Config:
        from_attributes = True


def _check_entity_type(entity_type: str) -> None:
    if entity_type not in STAGE_ENTITY_MODELS:
        raise HTTPException(404, "Стадии недоступны для этого типа сущности")


async def _require_stage_access(db: AsyncSession, entity_type: str, entity_id: int, user: User):
    """Владелец сущности, ИЛИ (для lab) owner/admin в LabMember этой лабы —
    не get_entity_for_lab_manage (та проверяет obj.lab_id ДОЧЕРНЕЙ сущности,
    а здесь entity_id ЕСТЬ id самой лабы, когда entity_type=='lab')."""
    model = STAGE_ENTITY_MODELS[entity_type]
    obj = await db.get(model, entity_id)
    if not obj or getattr(obj, "deleted_at", None) is not None:  # корзина = 404 (у Lab deleted_at нет)
        raise HTTPException(404, "Не найдено")
    if entity_type == "lab":
        role = await _lab_role(db, entity_id, user.id)
        if role not in ("owner", "admin"):
            raise HTTPException(403, "Недостаточно прав — нужна роль администратора лабы")
    else:
        if obj.user_id != user.id:
            raise HTTPException(403, "Нет доступа")
    return obj


@router.put("/{entity_type}/{entity_id}/stage", response_model=StageOut)
async def set_stage(entity_type: str, entity_id: int, body: StageIn,
                     user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    _check_entity_type(entity_type)
    if body.stage not in STAGE_VALUES:
        raise HTTPException(400, f"Недопустимая стадия: {body.stage}")

    obj = await _require_stage_access(db, entity_type, entity_id, user)

    # Скалярная колонка, не ORM-сущность: если бы здесь грузился весь
    # EntityStage-объект, он попал бы в identity map сессии, и следующий
    # INSERT ... ON CONFLICT ... RETURNING EntityStage вернул бы этот же,
    # уже закэшированный (старый) объект вместо свежей строки после апдейта
    # — RETURNING не обновляет атрибуты уже присутствующего в сессии
    # объекта без populate_existing. Скалярная колонка этой проблемы не
    # создаёт вообще.
    old_stage = await db.scalar(
        select(EntityStage.current_stage).where(
            EntityStage.entity_type == entity_type, EntityStage.entity_id == entity_id
        )
    )

    stmt = pg_insert(EntityStage).values(
        entity_type=entity_type, entity_id=entity_id, user_id=user.id, current_stage=body.stage,
    ).on_conflict_do_update(
        constraint="entity_stages_entity_unique",
        set_={"current_stage": body.stage},
    ).returning(EntityStage)
    row = (await db.execute(stmt)).scalar_one()

    await emit_event(
        db, type="stage_changed", actor_id=user.id,
        entity_type=entity_type, entity_id=entity_id,
        lab_id=getattr(obj, "lab_id", entity_id if entity_type == "lab" else None),
        visibility=getattr(obj, "visibility", "private" if entity_type != "lab" else ("public" if obj.is_public else "private")),
        meta={"old_stage": old_stage, "new_stage": body.stage},
    )
    await db.commit()
    return StageOut(entity_type=entity_type, entity_id=entity_id, current_stage=row.current_stage)


class StageListItem(BaseModel):
    entity_type: str
    entity_id: int
    title: str
    current_stage: str


@router.get("/stages/{stage}", response_model=list[StageListItem])
async def list_by_stage(stage: str, user: Optional[User] = Depends(get_current_user_optional),
                         db: AsyncSession = Depends(get_db)):
    """Все сущности (и лабы) на указанной стадии, видимые пользователю —
    та же политика видимости, что везде в проекте (свои + публичные + лабы,
    где состоишь), не полноценная per-item проверка владения/роли — для
    списка это было бы N лишних запросов на каждую строку без пользы:
    список только читается, ничего не меняет."""
    if stage not in STAGE_VALUES:
        raise HTTPException(400, f"Недопустимая стадия: {stage}")

    user_id = user.id if user else None
    rows = (await db.execute(
        select(EntityStage).where(EntityStage.current_stage == stage)
    )).scalars().all()

    by_type: dict[str, list[int]] = {}
    for row in rows:
        by_type.setdefault(row.entity_type, []).append(row.entity_id)

    result: list[StageListItem] = []
    for entity_type, ids in by_type.items():
        model = STAGE_ENTITY_MODELS[entity_type]

        if entity_type == "lab":
            # Lab не имеет visibility/lab_id — своя ветка видимости:
            # публичная лаба ИЛИ пользователь в ней состоит.
            member_lab_ids = select(LabMember.lab_id).where(LabMember.user_id == user_id) if user_id else select(LabMember.lab_id).where(sa_false())
            visible = (await db.execute(
                select(model).where(model.id.in_(ids), or_(model.is_public == True, model.id.in_(member_lab_ids)))
            )).scalars().all()
        else:
            visible = (await db.execute(
                select(model).where(model.id.in_(ids), entity_visibility_filter(model, user_id))
            )).scalars().all()

        for obj in visible:
            entity_id_for_stage = obj.id
            stage_row = next(r for r in rows if r.entity_type == entity_type and r.entity_id == entity_id_for_stage)
            result.append(StageListItem(
                entity_type=entity_type, entity_id=obj.id,
                title=_title_of(entity_type, obj), current_stage=stage_row.current_stage,
            ))

    return result


@router.get("/{entity_type}/{entity_id}/stage", response_model=StageOut | None)
async def get_stage(entity_type: str, entity_id: int,
                     user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """None (не 404) при отсутствии записи — "стадия не отслеживается" это
    нормальное состояние, не ошибка (см. докстринг модуля)."""
    _check_entity_type(entity_type)
    await _require_stage_access(db, entity_type, entity_id, user)

    row = (await db.execute(
        select(EntityStage).where(EntityStage.entity_type == entity_type, EntityStage.entity_id == entity_id)
    )).scalar_one_or_none()
    if not row:
        return None
    return StageOut.model_validate(row)
