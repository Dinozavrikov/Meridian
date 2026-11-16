import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from app.core.lab_access import get_live, parent_alive_subquery
from app.db.session import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.entities import ScaleDef, ScaleValue
from app.services.repost import ENTITY_MODELS
from app.services.scale_values import set_scale_value
from app.schemas.entities import (
    ScaleDefCreate, ScaleDefUpdate, ScaleDefOut,
    ScaleLevelsOverride, ScaleValueIn, ScaleValueOut,
)
from typing import List, Optional

router = APIRouter(prefix="/scales", tags=["scales"])


def _out(row: ScaleDef) -> ScaleDefOut:
    return ScaleDefOut(
        id=row.id, builtin_key=row.builtin_key, entity_type=row.entity_type,
        name=row.name, description=row.description,
        min_val=row.min_val, max_val=row.max_val, step=row.step,
        group_by=row.group_by, color=row.color,
        levels=json.loads(row.levels or "[]"),
    )


# ── кастомные шкалы ─────────────────────────────────────────────────────────

@router.get("/defs", response_model=List[ScaleDefOut])
async def list_custom_scales(
    entity_type: Optional[str] = None,
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
):
    q = select(ScaleDef).where(ScaleDef.user_id == user.id, ScaleDef.builtin_key.is_(None))
    if entity_type:
        q = q.where(ScaleDef.entity_type == entity_type)
    rows = (await db.execute(q)).scalars().all()
    return [_out(r) for r in rows]


@router.post("/defs", response_model=ScaleDefOut, status_code=201)
async def create_custom_scale(body: ScaleDefCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    row = ScaleDef(
        user_id=user.id, builtin_key=None, entity_type=body.entity_type,
        name=body.name, description=body.description,
        min_val=body.min_val, max_val=body.max_val, step=body.step,
        group_by=body.group_by, color=body.color,
        levels=json.dumps([l.model_dump() for l in body.levels]),
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _out(row)


@router.put("/defs/{sid}", response_model=ScaleDefOut)
async def update_custom_scale(sid: int, body: ScaleDefUpdate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    row = (await db.execute(
        select(ScaleDef).where(ScaleDef.id == sid, ScaleDef.user_id == user.id, ScaleDef.builtin_key.is_(None))
    )).scalar_one_or_none()
    if not row:
        raise HTTPException(404, "Шкала не найдена")
    data = body.model_dump(exclude_unset=True)
    if "levels" in data and data["levels"] is not None:
        row.levels = json.dumps([l if isinstance(l, dict) else l.model_dump() for l in data.pop("levels")])
    for k, v in data.items():
        setattr(row, k, v)
    await db.commit()
    await db.refresh(row)
    return _out(row)


@router.delete("/defs/{sid}", status_code=204)
async def delete_custom_scale(sid: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    row = (await db.execute(
        select(ScaleDef).where(ScaleDef.id == sid, ScaleDef.user_id == user.id, ScaleDef.builtin_key.is_(None))
    )).scalar_one_or_none()
    if not row:
        raise HTTPException(404, "Шкала не найдена")
    await db.execute(delete(ScaleValue).where(ScaleValue.scale_id == f"custom_{sid}", ScaleValue.user_id == user.id))
    await db.delete(row)
    await db.commit()


# ── переопределения описаний встроенных шкал ────────────────────────────────

@router.get("/defs/builtin", response_model=dict)
async def get_builtin_overrides(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(
        select(ScaleDef).where(ScaleDef.user_id == user.id, ScaleDef.builtin_key.is_not(None))
    )).scalars().all()
    return {r.builtin_key: json.loads(r.levels or "[]") for r in rows}


@router.put("/defs/builtin/{builtin_key}", response_model=dict)
async def set_builtin_override(builtin_key: str, body: ScaleLevelsOverride, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    row = (await db.execute(
        select(ScaleDef).where(ScaleDef.user_id == user.id, ScaleDef.builtin_key == builtin_key)
    )).scalar_one_or_none()
    levels_json = json.dumps([l.model_dump() for l in body.levels])
    if row:
        row.levels = levels_json
    else:
        row = ScaleDef(user_id=user.id, builtin_key=builtin_key, entity_type="", name="", levels=levels_json)
        db.add(row)
    await db.commit()
    return {"builtin_key": builtin_key, "levels": body.levels}


# ── значения шкал у сущностей ───────────────────────────────────────────────

@router.get("/values", response_model=dict)
async def get_values(entity_type: str, entity_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(
        select(ScaleValue).where(
            ScaleValue.user_id == user.id,
            ScaleValue.entity_type == entity_type,
            ScaleValue.entity_id == entity_id,
            parent_alive_subquery(ScaleValue.entity_type, ScaleValue.entity_id),
        )
    )).scalars().all()
    return {r.scale_id: r.value for r in rows}


async def _validate_scale_id(db: AsyncSession, user_id: int, scale_id: str) -> None:
    """Значение можно ставить только существующей шкале: для custom_<id> — СВОЕЙ пользовательской.
    Иначе в scale_values копились бы строки-сироты и чужие id, а откат потом «воскрешал» бы их.
    Встроенные id (maturity, importance ...) бэкенд не перечисляет: их список живёт на фронте
    (lib/scales.ts), здесь проверяется только длина (колонка String(64))."""
    if len(scale_id) > 64:
        raise HTTPException(400, "Слишком длинный id шкалы")
    if scale_id.startswith("custom_"):
        raw = scale_id[len("custom_"):]
        found = None
        if raw.isascii() and raw.isdigit() and len(raw) <= 9:
            found = await db.scalar(select(ScaleDef.id).where(
                ScaleDef.id == int(raw), ScaleDef.user_id == user_id, ScaleDef.builtin_key.is_(None)))
        if found is None:
            raise HTTPException(400, "Шкала не найдена")


@router.put("/values", response_model=Optional[ScaleValueOut])
async def set_value(body: ScaleValueIn, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    # Временная заглушка: пока нет агрегирующей формулы по голосам всех
    # пользователей (см. обсуждение), значение шкалы может выставлять
    # только владелец сущности — раньше проверки не было вовсе, что
    # позволяло любому залогиненному молча создать запись на чужой entity_id.
    # TODO: снять owner-only ограничение, когда появится агрегация по голосам.
    model = ENTITY_MODELS.get(body.entity_type)
    if model is None:
        raise HTTPException(400, "Неизвестный тип сущности")
    entity = await get_live(db, model, body.entity_id)
    if entity is None or entity.user_id != user.id:
        raise HTTPException(403, "Изменять шкалу может только владелец записи")

    await _validate_scale_id(db, user.id, body.scale_id)
    # Значение пишется вместе с событием журнала (services/scale_values.py): так оно попадает в
    # историю записи и откатывается. Owner-only выше — условие того, что в историю владельца
    # попадают только его значения; при снятии TODO чужие значения туда попадать не должны.
    try:
        await set_scale_value(db, user_id=user.id, obj=entity, entity_type=body.entity_type,
                              scale_id=body.scale_id, value=body.value)
    except LookupError:
        raise HTTPException(404, "Не найдено")  # запись удалили между проверкой доступа и записью
    await db.commit()
    if body.value is None:
        return None
    return ScaleValueOut(entity_type=body.entity_type, entity_id=body.entity_id, scale_id=body.scale_id, value=body.value)
