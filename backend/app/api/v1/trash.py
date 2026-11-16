"""Корзина: GET /trash, POST /{entity_type}/{id}/restore, DELETE /{entity_type}/{id}/permanent.

Всё строго owner-only и персональное (не lab-scoped: корзина принадлежит автору,
даже если запись на момент удаления была в лабе). Чужая/несуществующая запись —
404, не 403 (не подтверждаем факт существования, как require_owned_entity).

permanent — единственное место, где для 6 базовых типов реально срабатывает
session.deleted, а значит и весь каскад PR A в event_log.py; работает ТОЛЬКО
для записи, уже лежащей в корзине. Массовой очистки нет — сознательно."""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.entity_stage import _title_of  # тот же _TITLE_ATTR, не пишем заново
from app.core.deps import get_current_user
from app.core.entity_registry import ENTITY_MODELS
from app.db.session import get_db
from app.models.user import User
from app.services.soft_delete import purge_entity, restore_entity

router = APIRouter(tags=["trash"])


class TrashItem(BaseModel):
    entity_type: str
    id: int
    title: str
    deleted_at: datetime
    visibility: str
    lab_id: Optional[int] = None
    status: Optional[str] = None


def _model_or_400(entity_type: str):
    model = ENTITY_MODELS.get(entity_type)
    if model is None:
        raise HTTPException(400, "Invalid entity type")
    return model


async def _owned_or_404(db: AsyncSession, entity_type: str, entity_id: int, user: User):
    model = _model_or_400(entity_type)
    obj = await db.get(model, entity_id)  # намеренно db.get: здесь нужны и мёртвые записи
    if not obj or obj.user_id != user.id:
        raise HTTPException(404, "Не найдено")
    return obj


@router.get("/trash", response_model=list[TrashItem])
async def list_trash(entity_type: Optional[str] = None,
                     user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Плоский список, новые удаления сверху; entity_type= сужает до одного типа."""
    if entity_type is not None:
        _model_or_400(entity_type)
        types = [entity_type]
    else:
        types = list(ENTITY_MODELS)
    items: list[TrashItem] = []
    for et in types:
        model = ENTITY_MODELS[et]
        rows = (await db.execute(
            select(model).where(model.user_id == user.id, model.deleted_at.is_not(None))
        )).scalars().all()
        items += [TrashItem(entity_type=et, id=o.id, title=_title_of(et, o), deleted_at=o.deleted_at,
                            visibility=o.visibility, lab_id=o.lab_id, status=getattr(o, "status", None)) for o in rows]
    items.sort(key=lambda i: i.deleted_at, reverse=True)
    return items


@router.post("/{entity_type}/{entity_id}/restore", status_code=204)
async def restore(entity_type: str, entity_id: int,
                  user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    obj = await _owned_or_404(db, entity_type, entity_id, user)
    if obj.deleted_at is None:
        raise HTTPException(400, "Запись не в корзине")
    await restore_entity(db, entity_type, obj, user)


@router.delete("/{entity_type}/{entity_id}/permanent", status_code=204)
async def permanent_delete(entity_type: str, entity_id: int,
                           user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    obj = await _owned_or_404(db, entity_type, entity_id, user)
    if obj.deleted_at is None:
        raise HTTPException(400, "Нельзя очистить запись, которой нет в корзине")
    # purge_entity: pre-purge хуки (остаток калибровки прогноза) + db.delete(obj) -> session.deleted -> каскад PR A
    await purge_entity(db, entity_type, obj)
