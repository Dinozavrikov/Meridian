from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.user import User


async def attach_owner_info(db: AsyncSession, items: list) -> list:
    """Заполняет owner_username/owner_display_name на каждом Out-объекте по
    его user_id — один общий запрос на всех владельцев сразу, а не по
    одному на каждую сущность (важно для списков). Используется, чтобы
    гость мог увидеть автора публичной записи и перейти в его профиль,
    не полагаясь на currentUser на фронте (см. EntityActionsBar)."""
    ids = {getattr(item, "user_id", None) for item in items}
    ids.discard(None)
    if not ids:
        return items
    rows = (await db.execute(
        select(User.id, User.username, User.display_name).where(User.id.in_(ids))
    )).all()
    by_id = {uid: (username, display_name) for uid, username, display_name in rows}
    for item in items:
        uid = getattr(item, "user_id", None)
        if uid in by_id:
            item.owner_username, item.owner_display_name = by_id[uid]
    return items
