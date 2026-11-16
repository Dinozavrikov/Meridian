"""Роль и отношение конкурирующей гипотезы к вопросу или задаче (entity_hypotheses.role / stance).

Роль (leading | alternative | rejected) — решение автора, расчёты не меняет; ведущая одна: назначение
новой переводит прежнюю в «альтернативу». Каждое изменение пишет событие competing_changed для истории и отката.
Права те же, что у привязки гипотезы к родителю (get_entity_for_lab_manage)."""
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.core.lab_access import get_entity_for_lab_manage, get_live
from app.db.session import get_db
from app.models.entities import Hypothesis
from app.models.user import User
from app.schemas._strict import StrictIn
from app.services.entity_hypotheses import PARENT_MODELS
from app.services.events import emit_event
from app.services.link_events import _competing_row, demote_other_leading, link_event_scope

router = APIRouter(tags=["competing"])


class CompetingIn(StrictIn):
    role: Optional[Literal["leading", "alternative", "rejected"]] = None
    stance: Optional[Literal["подтверждает", "опровергает", "связано"]] = None


class CompetingOut(BaseModel):
    parent_type: str
    parent_id: int
    hypothesis_id: int
    role: str
    stance: str


@router.put("/competing/{parent_type}/{parent_id}/{hypothesis_id}", response_model=CompetingOut)
async def set_competing(parent_type: str, parent_id: int, hypothesis_id: int, body: CompetingIn,
                        user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    model = PARENT_MODELS.get(parent_type)
    if model is None:
        raise HTTPException(404, "Неизвестный тип записи")
    if body.role is None and body.stance is None:
        raise HTTPException(400, "Нужно указать роль или отношение")
    await get_entity_for_lab_manage(db, model, parent_id, user.id)
    if await get_live(db, Hypothesis, hypothesis_id) is None:
        raise HTTPException(404, "Не найдено")
    row = await _competing_row(db, parent_type, parent_id, hypothesis_id)
    if row is None:
        raise HTTPException(404, "Гипотеза не привязана к этой записи")
    lab_id, vis = await link_event_scope(db, user.id, "hypothesis", hypothesis_id, parent_type, parent_id)

    for field, new in (("role", body.role), ("stance", body.stance)):
        if new is None or getattr(row, field) == new:
            continue
        old = getattr(row, field)
        setattr(row, field, new)
        meta = {"field": field, "old": old, "new": new}
        if field == "role" and new == "leading":
            meta["demoted"] = await demote_other_leading(db, parent_type, parent_id, hypothesis_id)
        await emit_event(db, type="competing_changed", actor_id=user.id, entity_type="hypothesis", entity_id=hypothesis_id,
                          related_type=parent_type, related_id=parent_id, lab_id=lab_id, visibility=vis, meta=meta)
    await db.commit()
    return CompetingOut(parent_type=parent_type, parent_id=parent_id, hypothesis_id=hypothesis_id, role=row.role, stance=row.stance)
