"""Личные заметки владельца на публичной/лабораторной записи.

Правило одно на всё приложение: корневой комментарий ВЛАДЕЛЬЦА записи без позиции (stance IS NULL) — его заметка
для себя, как и любой ответ на такую заметку. Остальное — обсуждение. Видит заметки только владелец; в счётчик
обсуждения они не входят. Использовать здесь, а не переписывать условие по месту (иначе одно место отстанет)."""
from typing import Iterable, Optional


def personal_comment_ids(rows: Iterable[tuple], owner_id: Optional[int]) -> set[int]:
    """rows — кортежи (id, author_id, parent_id, stance) комментариев ОДНОЙ записи. Родитель создан раньше ребёнка
    (id растёт), поэтому одного прохода по возрастанию id хватает и для цепочек ответов."""
    hidden: set[int] = set()
    for cid, author_id, parent_id, stance in sorted(rows):
        if (owner_id is not None and author_id == owner_id and stance is None and parent_id is None) \
                or parent_id in hidden:
            hidden.add(cid)
    return hidden


async def comment_hidden_from(db, comment, owner_id: Optional[int], viewer_id: Optional[int]) -> bool:
    """Поштучная проверка (перевод и т.п.): скрыт ли комментарий от зрителя. Ответ скрыт, если корень цепочки —
    личная заметка владельца; то же правило, что в personal_comment_ids."""
    from app.models.social import EntityComment
    if viewer_id is not None and viewer_id == owner_id:
        return False
    root = comment
    for _ in range(100):   # защита от цикла; реальная глубина ответов мала
        if root.parent_id is None:
            break
        parent = await db.get(EntityComment, root.parent_id)
        if parent is None:
            break
        root = parent
    return owner_id is not None and root.parent_id is None and root.author_id == owner_id and root.stance is None
