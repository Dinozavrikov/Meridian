"""Откуда ensure-content берёт текст и кто его вправе видеть.

Сервер не верит присланному тексту: для записи, которую зритель видит, переводится текст из базы; невидимая, удалённая
и несуществующая запись молча пропускается (в кэш ничего не пишется). Исключение — производные поля (отрывки и заголовки,
которые фронтенд собирает сам из HTML/колонок): их текст принимается после проверки видимости, но не длиннее MAX_DERIVED_TEXT.
Правила доступа не копируются, а переиспользуются из тех модулей, где они уже живут."""
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select

from app.core.entity_registry import ENTITY_MODELS
from app.core.lab_access import get_entity_for_read, get_entity_for_view
from app.models.entities import Result, SourceDocument
from app.models.social import Conversation, EntityComment, Lab, LabJoinRequest, LabMember, Message, ObservationPost
from app.models.user import User

MAX_DERIVED_TEXT = 600
BASE_DERIVED = frozenset({"title", "preview", "preview_title", "preview_excerpt"})
RESULT_DERIVED = frozenset({"preview"})
OBS_POST_DERIVED = frozenset({"preview"})   # отрывок заметки собирает фронтенд из content
# Имя поля на фронтенде -> колонка модели, если они различаются.
FIELD_ATTR = {("message", "text"): "content"}


async def _load(db, user: User | None, entity_type: str, entity_id: int) -> Any:
    """Запись, если зритель ее видит, иначе None. Гость (user=None) видит только публичные записи
    основных типов и заметки к ним; остальные типы ему не отдаются вовсе."""
    uid = user.id if user is not None else None
    if user is None and entity_type not in ENTITY_MODELS and entity_type != "obs_post":
        return None
    try:
        if entity_type in ENTITY_MODELS:
            return await get_entity_for_read(db, ENTITY_MODELS[entity_type], entity_id, uid, hide_as_404=True)  # перевод текста, который зритель вправе читать
        if entity_type == "result":
            res = await db.get(Result, entity_id)
            if res is None:
                return None
            if res.is_published and res.visibility == "lab":   # публичное чтение, как в get_result
                lab = await db.get(Lab, res.lab_id)
                if lab and lab.is_public:
                    return res
            return await get_entity_for_view(db, Result, entity_id, user.id, hide_as_404=True)
        if entity_type == "obs_post":   # заметка к наблюдению: видна тому, кому видно наблюдение (как в ленте)
            post = await db.get(ObservationPost, entity_id)
            if post is None:
                return None
            await get_entity_for_read(db, ENTITY_MODELS["observation"], post.observation_id, uid, hide_as_404=True)
            return post
        if entity_type == "comment":
            from app.api.v1.comments import _check_entity_access
            c = await db.get(EntityComment, entity_id)
            if c is None:
                return None
            entity = await _check_entity_access(db, c.entity_type, c.entity_id, user)
            from app.core.personal_notes import comment_hidden_from
            if await comment_hidden_from(db, c, getattr(entity, "user_id", None), user.id):
                return None   # личная заметка владельца: даже перевод её текста другим не отдаётся
            return c
        if entity_type == "source_document":
            from app.api.v1.sources import _check_view_access
            sd = await db.get(SourceDocument, entity_id)
            if sd is None:
                return None
            await _check_view_access(sd.entity_type, sd.entity_id, user.id, db)
            return sd
        if entity_type == "lab":
            lab = await db.get(Lab, entity_id)
            if lab is None:
                return None
            if lab.is_public:
                return lab
            member = await db.scalar(select(LabMember.user_id).where(LabMember.lab_id == entity_id, LabMember.user_id == user.id))
            return lab if member else None
        if entity_type == "message":
            m = await db.get(Message, entity_id)
            conv = await db.get(Conversation, m.conversation_id) if m else None
            return m if conv and user.id in (conv.user_a_id, conv.user_b_id) else None
        if entity_type == "lab_join_request":
            req = await db.get(LabJoinRequest, entity_id)
            if req is None:
                return None
            if req.user_id == user.id:
                return req
            role = await db.scalar(select(LabMember.role).where(LabMember.lab_id == req.lab_id, LabMember.user_id == user.id))
            return req if role in ("owner", "admin") else None
        if entity_type == "user":
            return await db.get(User, entity_id)
    except HTTPException:
        return None
    return None


def _text(entity_type: str, field: str, sent: str, obj: Any) -> str | None:
    derived = BASE_DERIVED if entity_type in ENTITY_MODELS else RESULT_DERIVED if entity_type == "result" else OBS_POST_DERIVED if entity_type == "obs_post" else frozenset()
    if field in derived:
        return sent if len(sent) <= MAX_DERIVED_TEXT else None
    value = getattr(obj, FIELD_ATTR.get((entity_type, field), field), None)
    return value if isinstance(value, str) and value else None


async def resolve_content_items(db, user: User | None, items: list) -> list:
    """Оставляет только пункты видимых записей и подставляет в них текст из базы."""
    seen: dict[tuple[str, int], Any] = {}
    out = []
    for it in items:
        key = (it.entity_type, it.entity_id)
        if key not in seen:
            seen[key] = await _load(db, user, *key)
        obj = seen[key]
        if obj is None:
            continue
        text = _text(it.entity_type, it.field, it.text, obj)
        if text:
            out.append(it.model_copy(update={"text": text}))
    return out
