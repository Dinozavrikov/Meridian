"""Единая точка записи в append-only лог событий (см. models.entities.Event).
Лента (feed.py) читает ТОЛЬКО из этой таблицы — не из union'а сущностей —
поэтому любое действие, которое должно быть видно в ленте, обязано пройти
через emit_event, а не молча создавать/менять строку в своей таблице."""
import logging
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.entities import Event

logger = logging.getLogger(__name__)


async def emit_event(
    db: AsyncSession,
    *,
    type: str,
    actor_id: int,
    entity_type: str,
    entity_id: int,
    visibility: str,
    lab_id: int | None = None,
    related_type: str | None = None,
    related_id: int | None = None,
    meta: dict | None = None,
) -> Event:
    """Не коммитит — вызывающий код сам решает транзакционную границу
    (обычно один commit на весь create/update-роут, событие идёт в него же)."""
    ev = Event(
        type=type, actor_id=actor_id,
        entity_type=entity_type, entity_id=entity_id,
        related_type=related_type, related_id=related_id,
        lab_id=lab_id, visibility=visibility, meta=meta or {},
    )
    db.add(ev)
    return ev
