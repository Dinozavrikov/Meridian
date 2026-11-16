"""Помощник тестов: строка согласия для связи, вставленной прямо в БД (через API её создаёт share=lab)."""
from app.core.entity_registry import ENTITY_MODELS
from app.db.session import AsyncSessionLocal
from app.models.entities import RecordShare


async def add_share(entity_type, entity_id, via_type, via_id, by=None):
    async with AsyncSessionLocal() as db:
        via = await db.get(ENTITY_MODELS[via_type], via_id)
        if via is None or not via.lab_id or via.visibility != "lab":
            return
        owner = by or (await db.get(ENTITY_MODELS[entity_type], entity_id)).user_id
        db.add(RecordShare(entity_type=entity_type, entity_id=entity_id, lab_id=via.lab_id,
                           via_type=via_type, via_id=via_id, granted_by=owner))
        await db.commit()
