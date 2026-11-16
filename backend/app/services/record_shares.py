"""Бэкфилл record_shares: воссоздаёт согласие для записей, которые открыты через связь по сегодняшнему правилу.
Идемпотентно: повторный запуск ничего не добавляет. Возвращает, сколько строк добавлено (коммитит вызывающий)."""
from sqlalchemy import select

from app.core.entity_registry import ENTITY_MODELS
from app.core.lab_access import open_triples_query
from app.models.entities import RecordShare


async def backfill_record_shares(db) -> int:
    added = 0
    seen: set[tuple] = set()
    for etype, model in ENTITY_MODELS.items():
        for n_id, lab_id, via_type, via_id, owner in (await db.execute(open_triples_query(model, etype))).all():
            key = (etype, n_id, lab_id, via_type, via_id)
            if key in seen:
                continue
            seen.add(key)
            if await db.scalar(select(RecordShare.id).where(
                    RecordShare.entity_type == etype, RecordShare.entity_id == n_id, RecordShare.lab_id == lab_id,
                    RecordShare.via_type == via_type, RecordShare.via_id == via_id)) is None:
                db.add(RecordShare(entity_type=etype, entity_id=n_id, lab_id=lab_id, via_type=via_type, via_id=via_id, granted_by=owner))
                added += 1
    await db.flush()
    return added
