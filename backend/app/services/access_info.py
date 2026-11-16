"""Поле access в ответах записей: owner / member / public / opened. opened = запись открыта зрителю через связь
(только чтение): фронт по нему прячет формы записи. Один запрос на ответ, остальное в памяти."""
from sqlalchemy import select

from app.models.social import LabMember


async def attach_access(db, items: list, viewer_id) -> list:
    my_labs: set = set()
    if viewer_id is not None:
        my_labs = set((await db.execute(select(LabMember.lab_id).where(LabMember.user_id == viewer_id))).scalars().all())
    for it in items:
        vis, lab = getattr(it, "visibility", None), getattr(it, "lab_id", None)
        if viewer_id is not None and getattr(it, "user_id", None) == viewer_id:
            it.access = "owner"
        elif vis == "public":
            it.access = "public"
        elif vis == "lab" and lab in my_labs:
            it.access = "member"
        else:
            it.access = "opened" if viewer_id is not None else "public"
    return items
