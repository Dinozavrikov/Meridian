from app.schemas._strict import StrictIn, Short16, Short32, Short128, Short255, LongText
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
import os, uuid
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.personal_notes import personal_comment_ids, comment_hidden_from
from app.db.session import get_db
from app.models.social import EntityComment, UserCommentSeen, LabMember
from app.models.user import User, NotificationPrefs
from app.models.entities import Observation, Hypothesis, Prediction, Worldview, Question, ResearchTask



def _entity_display_title(entity_type: str, entity) -> str:
    """Заголовок сущности для показа в UI (колокольчик уведомлений) — поле
    с заголовком называется по-разному в разных моделях (title/name/belief),
    и не у всех оно гарантированно непустое (Observation.title default="")."""
    if entity_type == "hypothesis":
        return entity.name
    if entity_type == "worldview":
        return entity.belief[:80]
    if entity_type == "task":
        return entity.name
    return getattr(entity, "title", None) or entity.text[:80]
from app.services.email import (
    send_email, render_email_html, email_button, entity_tag, entity_url,
    ENTITY_POSSESSIVE_ACC, esc,
)
from app.core.deps import get_current_user
from app.services.entity_access import ENTITY_OWNER_MODELS
from app.core.lab_access import get_entity_for_view, get_entity_for_read, parent_alive_subquery
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
from sqlalchemy import func, and_

router = APIRouter(prefix="/comments", tags=["comments"])

ALLOWED = {"observation", "hypothesis", "prediction", "question", "task", "worldview"}
ALLOWED_STANCE = {"confirm", "neutral", "refute"}

# ── Полевой журнал: доступ только владельцу ─────────────────────────────────
# Заметки в NotesTimeline — это личный журнал исследователя, а не публичное
# обсуждение (для него в проекте отдельный компонент CommentsPanel (позже удалён), сейчас
# нигде не подключённый). Поэтому весь тред заметок — чтение, создание,
# отметка "прочитано" — доступен только владельцу самой сущности.


async def _check_entity_access(db: AsyncSession, entity_type: str, entity_id: int, user: User, *, write: bool = False):
    """
    Проверка доступа к обсуждению сущности (чтение/комментирование), а не
    только к личному полевому журналу. Раньше здесь была отдельная копия
    политики доступа (owner/public/lab) — теперь делегирует в общую
    get_entity_for_read (чтение) и get_entity_for_view (write=True: запись, правка, удаление) из lab_access.py с hide_as_404=True: обсуждения
    намеренно не подтверждают даже факт существования недоступной записи
    (в отличие от большинства других эндпоинтов, которые отдают 403) —
    осознанное решение, не баг, см. ACCESS_POLICY.md.
    """
    model = ENTITY_OWNER_MODELS.get(entity_type)
    if model is None:
        raise HTTPException(400, "Invalid entity type")
    if write:   # запись открыта через связь только для чтения: комментировать её нельзя
        from app.core.lab_access import get_entity_for_view as _strict_view
        return await _strict_view(db, model, entity_id, user.id, hide_as_404=True)
    return await get_entity_for_read(db, model, entity_id, user.id, hide_as_404=True)  # читать может и тот, кому запись открыта через связь


class CommentIn(StrictIn):
    content: LongText
    parent_id: Optional[int] = None
    stance: Optional[Short16] = None  # confirm|neutral|refute — используется страницей обсуждения
    source: Optional[Short32] = None  # 'reflection_followup' и т.п. — маркер происхождения

class CommentOut(BaseModel):
    id: int
    entity_type: str
    entity_id: int
    author_id: int
    author_username: str
    author_display: str
    author_avatar_url: Optional[str] = None
    content: str
    parent_id: Optional[int]
    stance: Optional[str] = None
    created_at: datetime
    is_new: bool = False   # чужой комментарий позже вашей отметки просмотра (UserCommentSeen); только в GET списка
    replies: list["CommentOut"] = []
    model_config = {"from_attributes": True}

CommentOut.model_rebuild()

class UnreadItem(BaseModel):
    entity_type: str
    entity_id: int
    entity_slug: str = ""
    entity_title: str = ""
    count: int
    # последний комментарий для превью
    last_content: str
    last_author: str
    last_at: datetime

# — Загрузка изображений для комментариев дискуссии —
# Та же схема валидации, что у аватара (users.py), отдельная директория хранения.
COMMENT_IMG_DIR = "uploads/comments"
ALLOWED_IMG_TYPES = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}
MAX_IMG_SIZE = 8 * 1024 * 1024  # 8MB

@router.post("/upload-image")
async def upload_comment_image(file: UploadFile = File(...), user: User = Depends(get_current_user)):
    if file.content_type not in ALLOWED_IMG_TYPES:
        raise HTTPException(400, "Разрешены только JPEG, PNG или WebP")
    data = await file.read()
    if len(data) > MAX_IMG_SIZE:
        raise HTTPException(400, "Файл больше 8 МБ")
    os.makedirs(COMMENT_IMG_DIR, exist_ok=True)
    ext = ALLOWED_IMG_TYPES[file.content_type]
    filename = f"{user.id}_{uuid.uuid4().hex}.{ext}"
    with open(f"{COMMENT_IMG_DIR}/{filename}", "wb") as f:
        f.write(data)
    return {"url": f"/api/uploads/comments/{filename}"}


@router.get("/unread/summary", response_model=list[UnreadItem])
async def unread_summary(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """
    Комментарии к сущностям текущего пользователя или ответы на его комментарии,
    оставленные ПОСЛЕ последнего seen_at (или вообще не seen).
    """
    from app.models.social import EntityComment

    # seen_at для каждой пары (entity_type, entity_id)
    seen_rows = (await db.execute(
        select(UserCommentSeen.entity_type, UserCommentSeen.entity_id, UserCommentSeen.seen_at)
        .where(UserCommentSeen.user_id == user.id)
    )).all()
    seen_map = {(r.entity_type, r.entity_id): r.seen_at for r in seen_rows}

    # все комментарии не от текущего пользователя
    all_comments = (await db.execute(
        select(EntityComment)
        .where(EntityComment.author_id != user.id,
                parent_alive_subquery(EntityComment.entity_type, EntityComment.entity_id))
        .order_by(EntityComment.created_at.desc())
    )).scalars().all()

    # группируем: только те где user владеет сущностью или написал родительский комментарий
    from collections import defaultdict
    groups: dict[tuple, list] = defaultdict(list)

    # id комментариев текущего пользователя
    my_comment_ids = {
        c.id for c in (await db.execute(
            select(EntityComment).where(EntityComment.author_id == user.id)
        )).scalars().all()
    }

    # entity_ids которыми владеет пользователь — по всем шести типам сущностей
    # (раньше здесь были только observation/hypothesis/prediction; question/
    # worldview/task тихо никогда не попадали в непрочитанные — тот же класс
    # бага, что был в email-уведомлениях до сегодняшнего фикса).
    my_entities: dict[str, set[int]] = {}
    for etype, model in ENTITY_OWNER_MODELS.items():
        my_entities[etype] = set(
            (await db.execute(select(model.id).where(model.user_id == user.id))).scalars().all()
        )

    for c in all_comments:
        key = (c.entity_type, c.entity_id)
        is_my_entity = c.entity_id in my_entities.get(c.entity_type, set())
        is_reply_to_me = c.parent_id in my_comment_ids
        if not (is_my_entity or is_reply_to_me):
            continue
        seen_at = seen_map.get(key)
        if seen_at and c.created_at <= seen_at:
            continue
        groups[key].append(c)

    result = []
    for (etype, eid), comments in groups.items():
        # Бейдж не помнит то, что зритель читать уже не может (запись стала приватной,
        # вышла из лаборатории, удалена): иначе в нём остаются название и начало ответа.
        try:
            await _check_entity_access(db, etype, eid, user)
        except HTTPException:
            continue
        last = comments[0]
        author = await db.get(User, last.author_id)
        model = ENTITY_OWNER_MODELS.get(etype)
        entity = await db.get(model, eid) if model else None
        result.append(UnreadItem(
            entity_type=etype, entity_id=eid,
            entity_slug=(entity.slug if entity else "") or "",
            entity_title=_entity_display_title(etype, entity) if entity else f"{etype} #{eid}",
            count=len(comments),
            last_content=last.content[:80],
            last_author=author.display_name if author else "",
            last_at=last.created_at,
        ))

    result.sort(key=lambda x: x.last_at, reverse=True)
    return result


@router.get("/{entity_type}/{entity_id}", response_model=list[CommentOut])
async def get_comments(entity_type: str, entity_id: int,
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if entity_type not in ALLOWED:
        raise HTTPException(400, "Invalid entity type")
    entity = await _check_entity_access(db, entity_type, entity_id, user)
    rows = (await db.execute(
        select(EntityComment)
        .where(EntityComment.entity_type == entity_type, EntityComment.entity_id == entity_id,
                parent_alive_subquery(EntityComment.entity_type, EntityComment.entity_id))
        .order_by(EntityComment.created_at)
    )).scalars().all()
    seen_at = await db.scalar(select(UserCommentSeen.seen_at).where(
        UserCommentSeen.user_id == user.id, UserCommentSeen.entity_type == entity_type, UserCommentSeen.entity_id == entity_id))
    if user.id != getattr(entity, "user_id", None):   # личные заметки владельца видит только он
        hidden = personal_comment_ids([(c.id, c.author_id, c.parent_id, c.stance) for c in rows], entity.user_id)
        rows = [c for c in rows if c.id not in hidden]
    # Строим дерево
    by_id: dict[int, CommentOut] = {}
    roots: list[CommentOut] = []
    for c in rows:
        author = await db.get(User, c.author_id)
        out = CommentOut(
            id=c.id, entity_type=c.entity_type, entity_id=c.entity_id,
            author_id=c.author_id,
            author_username=author.username if author else "",
            author_display=author.display_name if author else "",
            author_avatar_url=author.avatar_url if author else None,
            content=c.content, parent_id=c.parent_id, stance=c.stance, created_at=c.created_at,
            is_new=c.author_id != user.id and (seen_at is None or c.created_at > seen_at),
        )
        by_id[c.id] = out
        if c.parent_id and c.parent_id in by_id:
            by_id[c.parent_id].replies.append(out)
        else:
            roots.append(out)
    return roots

async def _notify_comment_recipients(db: AsyncSession, entity_type: str, entity_id: int,
                                      parent_id: int | None, author: User, content: str):
    """Письмо владельцу сущности и автору родительского комментария (если это ответ), кроме самого себя.

    Роль получателя различается: владельцу сущности пишем "прокомментировал(а) ваше Х",
    автору родительского комментария (если это не тот же человек) — "ответил(а) на ваш
    комментарий", т.к. он не обязательно владелец сущности, и старая обобщённая
    формулировка "вашу запись" была бы для него фактически неверной.
    """
    recipient_roles: dict[int, str] = {}  # user_id -> "owner" | "reply"

    model = ENTITY_OWNER_MODELS.get(entity_type)
    entity = await db.get(model, entity_id) if model else None
    if entity and entity.user_id != author.id:
        recipient_roles[entity.user_id] = "owner"

    if parent_id:
        parent = await db.get(EntityComment, parent_id)
        if parent and parent.author_id != author.id:
            recipient_roles.setdefault(parent.author_id, "reply")

    if not recipient_roles:
        return

    # title у Observation/Prediction, name у Hypothesis; у Observation title
    # может быть пустой строкой (default=""), поэтому фоллбэк на текст.
    entity_title = ""
    entity_slug = ""
    if entity:
        entity_slug = entity.slug
        raw_title = getattr(entity, "title", None) or getattr(entity, "name", None) or ""
        entity_title = raw_title or entity.text[:80]

    for rid, role in recipient_roles.items():
        recipient = await db.get(User, rid)
        if not recipient:
            continue
        # Письмо несёт название записи и текст ответа: получателю, которому запись уже не открыта
        # (стала приватной, вышла из лаборатории, в корзине), его не шлём — то же правило, что у бейджа.
        try:
            await _check_entity_access(db, entity_type, entity_id, recipient)
        except HTTPException:
            continue
        prefs = (await db.execute(select(NotificationPrefs).where(NotificationPrefs.user_id == rid))).scalar_one_or_none()
        if prefs is not None and not prefs.comments:
            continue
        author_name = author.display_name or author.username
        preview = content[:200]
        link = entity_url(entity_type, entity_slug) if entity_slug else "https://miridin.com/feed"

        if role == "owner":
            subject = f"{author_name} прокомментировал(а) вашу запись в Meridian"
            intro = f'<strong>{esc(author_name)}</strong> прокомментировал(а) {ENTITY_POSSESSIVE_ACC[entity_type]}:'
        else:
            subject = f"{author_name} ответил(а) на ваш комментарий в Meridian"
            intro = f'<strong>{esc(author_name)}</strong> ответил(а) на ваш комментарий:'

        tag_line = (
            f'<p style="margin:0 0 14px 0;font-size:13px;color:rgba(242,239,233,0.45);">'
            f'{entity_tag(entity_type)} <strong style="color:#f2efe9;">{esc(entity_title)}</strong></p>'
        ) if entity_title else ""

        await send_email(
            to=recipient.email,
            subject=subject,
            body=f"{author_name}: {preview}\n\n{link}",
            html=render_email_html(
                preheader=esc(f"{author_name}: {preview}"),
                body_html=(
                    f'<p style="margin:0 0 8px 0;">{intro}</p>'
                    f'{tag_line}'
                    f'<p style="margin:0;padding:14px 18px;background:rgba(255,255,255,0.03);'
                    f'border-left:2px solid #4dcfa6;border-radius:4px;">{esc(preview)}</p>'
                    f'{email_button(link, "Открыть Meridian")}'
                ),
            ),
        )



@router.post("/{entity_type}/{entity_id}", response_model=CommentOut)
async def create_comment(entity_type: str, entity_id: int, body: CommentIn,
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if entity_type not in ALLOWED:
        raise HTTPException(400, "Invalid entity type")
    if body.stance is not None and body.stance not in ALLOWED_STANCE:
        raise HTTPException(400, "Invalid stance")
    entity = await _check_entity_access(db, entity_type, entity_id, user, write=True)

    if body.parent_id is not None:
        parent = await db.get(EntityComment, body.parent_id)
        if not parent:
            raise HTTPException(400, "Parent comment not found")
        if parent.entity_type != entity_type or parent.entity_id != entity_id:
            raise HTTPException(400, "Parent comment belongs to another entity")
        if await comment_hidden_from(db, parent, getattr(entity, "user_id", None), user.id):
            raise HTTPException(400, "Parent comment not found")   # личная заметка владельца: ответить под ней нельзя

    c = EntityComment(entity_type=entity_type, entity_id=entity_id,
        author_id=user.id, content=body.content, parent_id=body.parent_id, stance=body.stance,
        source=body.source)
    db.add(c)
    await db.commit()
    await db.refresh(c)

    await _notify_comment_recipients(db, entity_type, entity_id, body.parent_id, user, body.content)

    return CommentOut(
        id=c.id, entity_type=c.entity_type, entity_id=c.entity_id,
        author_id=c.author_id, author_username=user.username,
        author_display=user.display_name, author_avatar_url=user.avatar_url,
        content=c.content,
        parent_id=c.parent_id, stance=c.stance, created_at=c.created_at,
    )

@router.patch("/{comment_id}", response_model=CommentOut)
async def update_comment(comment_id: int, body: CommentIn,
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    c = await db.get(EntityComment, comment_id)
    if not c:
        raise HTTPException(404)
    if c.author_id != user.id:
        raise HTTPException(403)
    await _check_entity_access(db, c.entity_type, c.entity_id, user, write=True)
    c.content = body.content
    await db.commit()
    await db.refresh(c)
    author = await db.get(User, c.author_id)
    return CommentOut(
        id=c.id, entity_type=c.entity_type, entity_id=c.entity_id,
        author_id=c.author_id,
        author_username=author.username if author else "",
        author_display=author.display_name if author else "",
        author_avatar_url=author.avatar_url if author else None,
        content=c.content, parent_id=c.parent_id, created_at=c.created_at,
    )

@router.delete("/{comment_id}")
async def delete_comment(comment_id: int,
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    c = await db.get(EntityComment, comment_id)
    if not c:
        raise HTTPException(404)
    if c.author_id != user.id:
        raise HTTPException(403)
    await _check_entity_access(db, c.entity_type, c.entity_id, user, write=True)
    await db.delete(c)
    await db.commit()
    return {"ok": True}


@router.post("/seen/{entity_type}/{entity_id}")
async def mark_seen(entity_type: str, entity_id: int,
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Пометить все комментарии к сущности как прочитанные."""
    if entity_type in ENTITY_OWNER_MODELS:
        await _check_entity_access(db, entity_type, entity_id, user)
    existing = (await db.execute(
        select(UserCommentSeen).where(
            UserCommentSeen.user_id == user.id,
            UserCommentSeen.entity_type == entity_type,
            UserCommentSeen.entity_id == entity_id,
        )
    )).scalar_one_or_none()
    if existing:
        existing.seen_at = datetime.now(timezone.utc).replace(tzinfo=None)
    else:
        db.add(UserCommentSeen(
            user_id=user.id, entity_type=entity_type,
            entity_id=entity_id, seen_at=datetime.now(timezone.utc).replace(tzinfo=None)
        ))
    await db.commit()
    return {"ok": True}
