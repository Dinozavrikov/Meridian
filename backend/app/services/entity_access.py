from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.user import User
from app.core.entity_registry import ENTITY_MODELS as ENTITY_OWNER_MODELS

# ENTITY_OWNER_MODELS — тот же реестр, что и везде (см. app/core/entity_registry.py),
# реэкспортирован под этим именем, т.к. comments.py импортирует отсюда именно
# под этим названием. НЕ отдельный словарь — разница с ENTITY_MODELS в repost.py
# не в составе, а в логике проверки прав, построенной поверх (require_owned_entity
# здесь — строго owner-only, без исключений; repost.py такой проверки не делает).


async def require_owned_entity(db: AsyncSession, entity_type: str, entity_id: int, user: User,
                               *, include_deleted: bool = False):
    """Строгая проверка доступа: сущность существует и принадлежит user.
    Иначе 404 (не 403 — не подтверждаем даже факт существования чужой
    сущности). Возвращает саму сущность для дальнейшего использования.
    Запись в корзине (deleted_at) для владельца тоже 404, если не include_deleted."""
    model = ENTITY_OWNER_MODELS.get(entity_type)
    if model is None:
        raise HTTPException(400, "Invalid entity type")
    entity = await db.get(model, entity_id)
    if not entity or entity.user_id != user.id or (
        not include_deleted and getattr(entity, "deleted_at", None) is not None
    ):
        raise HTTPException(404, "Не найдено")
    return entity
