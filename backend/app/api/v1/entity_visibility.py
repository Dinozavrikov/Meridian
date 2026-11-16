"""Смена видимости записи одним запросом для всех шести типов сущностей.

Частичный запрос (только visibility и lab_id), а не полный PUT типа: он не может затереть
текст записи. Менять может только автор. Правила лабы — те же, что при создании
и правке (resolve_lab_attachment)."""
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.core.entity_registry import ENTITY_MODELS
from app.core.lab_access import (_title_of, resolve_lab_attachment, ensure_prediction_visibility_not_frozen,
                                 reset_shares_on_visibility_change)
from app.models.social import Lab
from app.services.events import emit_event
from app.models.entities import RecordShare
from app.db.session import get_db
from app.models.user import User
from app.schemas._strict import StrictIn

router = APIRouter(tags=["entity_visibility"])


class VisibilityIn(StrictIn):
    visibility: Literal["private", "lab", "public"]
    lab_id: Optional[int] = None


class VisibilityOut(BaseModel):
    entity_type: str
    entity_id: int
    visibility: str
    lab_id: Optional[int] = None


@router.put("/{entity_type}/{entity_id}/visibility", response_model=VisibilityOut)
async def set_visibility(entity_type: str, entity_id: int, body: VisibilityIn,
                         user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    model = ENTITY_MODELS.get(entity_type)
    if model is None:
        raise HTTPException(404, "Видимость недоступна для этого типа сущности")
    obj = await db.get(model, entity_id)
    if not obj or obj.deleted_at is not None:
        raise HTTPException(404, "Не найдено")
    if obj.user_id != user.id:
        raise HTTPException(403, "Менять видимость может только автор")
    if body.visibility == "lab" and not body.lab_id:
        raise HTTPException(400, "Для видимости «Лаборатория» выберите лабораторию")
    # lab_id живёт только вместе с видимостью «Лаборатория»: иначе запись унесёт «залипшую» лабу
    lab_id = body.lab_id if body.visibility == "lab" else None
    new_visibility = await resolve_lab_attachment(db, lab_id, body.visibility, user.id)
    if entity_type == "prediction":
        ensure_prediction_visibility_not_frozen(obj, new_visibility, lab_id)
    # Согласия на открытие через связь и событие visibility_changed — в одной общей функции (до присваивания).
    await reset_shares_on_visibility_change(db, entity_type, obj, new_visibility, lab_id, actor_id=user.id)
    obj.visibility = new_visibility
    obj.lab_id = lab_id
    await db.commit()
    return VisibilityOut(entity_type=entity_type, entity_id=entity_id, visibility=obj.visibility, lab_id=obj.lab_id)


class ShareOut(BaseModel):
    id: int
    lab_id: int
    lab_name: str
    via_type: str
    via_id: int
    via_title: str


async def _own_live(db: AsyncSession, entity_type: str, entity_id: int, user: User):
    model = ENTITY_MODELS.get(entity_type)
    if model is None:
        raise HTTPException(404, "Недоступно для этого типа сущности")
    obj = await db.get(model, entity_id)
    if not obj or obj.deleted_at is not None:
        raise HTTPException(404, "Не найдено")
    if obj.user_id != user.id:
        raise HTTPException(403, "Доступы записи видит только автор")
    return obj


@router.get("/{entity_type}/{entity_id}/shares", response_model=list[ShareOut])
async def list_shares(entity_type: str, entity_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Каким лабораториям запись открыта через связь (record_shares) и через какую связь. Только автор."""
    await _own_live(db, entity_type, entity_id, user)
    rows = (await db.execute(
        select(RecordShare, Lab.name).join(Lab, Lab.id == RecordShare.lab_id)
        .where(RecordShare.entity_type == entity_type, RecordShare.entity_id == entity_id)
        .order_by(RecordShare.id))).all()
    out = []
    for sh, lab_name in rows:
        via_model = ENTITY_MODELS.get(sh.via_type)
        via = await db.get(via_model, sh.via_id) if via_model else None
        title = _title_of(via) if via is not None and via.deleted_at is None else ""
        out.append(ShareOut(id=sh.id, lab_id=sh.lab_id, lab_name=lab_name, via_type=sh.via_type, via_id=sh.via_id, via_title=title))
    return out


@router.delete("/{entity_type}/{entity_id}/shares/{share_id}")
async def close_share(entity_type: str, entity_id: int, share_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Закрыть доступ: удаляется согласие, связь остаётся. Пишет приватное событие share_closed: доступ возвращается откатом (Undo)."""
    await _own_live(db, entity_type, entity_id, user)
    sh = await db.scalar(select(RecordShare).where(
        RecordShare.id == share_id, RecordShare.entity_type == entity_type, RecordShare.entity_id == entity_id))
    if sh is None:
        raise HTTPException(404, "Доступ не найден")
    lab_id, via_type, via_id = sh.lab_id, sh.via_type, sh.via_id
    await db.execute(delete(RecordShare).where(RecordShare.id == sh.id))
    # Приватное событие (без lab_id, видимость private): факт закрытия не светится в ленте лаборатории; по нему доступ возвращается откатом.
    ev = await emit_event(db, type="share_closed", actor_id=user.id, entity_type=entity_type, entity_id=entity_id,
                     related_type=via_type, related_id=via_id, lab_id=None, visibility="private", meta={"share_lab_id": lab_id})
    await db.flush()
    event_id = ev.id
    await db.commit()
    return {"ok": True, "event_id": event_id}
