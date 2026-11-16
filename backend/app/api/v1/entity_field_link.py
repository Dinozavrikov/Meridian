"""Связь прогноза с гипотезой, хранящаяся в самом прогнозе (predictions.hypothesis_id).

Тип связи — confirms_hypothesis_if_true: сбывшийся прогноз подтверждает гипотезу или опровергает её.
Операции: сменить тип, отвязать. Только автор прогноза. У закрытого прогноза связь не меняется:
вклад в сигнал гипотезы посчитан при закрытии, а исход уже известен (то же правило, что для уверенности).
Каждая операция пишет событие (field_link_changed / field_unlinked) для истории и отката.
Сама логика — services/link_mutations.py (её же использует пакетный эндпоинт)."""
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas._strict import StrictIn
from app.services.link_mutations import remove_field_link, set_field_stance

router = APIRouter(tags=["field_link"])


class FieldLinkIn(StrictIn):
    confirms: bool


class FieldLinkOut(BaseModel):
    prediction_id: int
    hypothesis_id: int
    stance: str


@router.put("/field-link/prediction/{pid}", response_model=FieldLinkOut)
async def set_field_link_type(pid: int, body: FieldLinkIn, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    hypothesis_id, stance = await set_field_stance(db, user.id, pid, body.confirms)
    await db.commit()
    return FieldLinkOut(prediction_id=pid, hypothesis_id=hypothesis_id, stance=stance)


@router.delete("/field-link/prediction/{pid}")
async def remove_field_link_endpoint(pid: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await remove_field_link(db, user.id, pid)
    await db.commit()
    return {"ok": True, "removed": 1}
