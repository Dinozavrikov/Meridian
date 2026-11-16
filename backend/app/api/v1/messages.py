from app.schemas._strict import StrictIn, Short16, Short32, Short128, Short255, LongText
import os, uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, and_, func
from pydantic import BaseModel, Field
from app.db.session import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.social import Conversation, Message
from app.models.user import NotificationPrefs
from app.services.email import send_email, render_email_html, email_button, esc

router = APIRouter(prefix="/messages", tags=["messages"])

# — Загрузка изображений-вложений для личных сообщений —
# Та же схема валидации, что у комментариев (comments.py), отдельная директория.
MESSAGE_IMG_DIR = "uploads/messages"
ALLOWED_IMG_TYPES = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}
MAX_IMG_SIZE = 8 * 1024 * 1024  # 8MB


class MessageOut(BaseModel):
    id: int
    conversation_id: int
    author_id: int
    content: str
    read: bool
    created_at: datetime
    model_config = {"from_attributes": True}


class ConversationOut(BaseModel):
    id: int
    other_user_id: int
    other_username: str
    other_display_name: str
    other_avatar_url: str | None = None
    last_message: str | None
    last_message_at: datetime
    unread_count: int


@router.post("/upload-image")
async def upload_message_image(file: UploadFile = File(...), user: User = Depends(get_current_user)):
    if file.content_type not in ALLOWED_IMG_TYPES:
        raise HTTPException(400, "Разрешены только JPEG, PNG или WebP")
    data = await file.read()
    if len(data) > MAX_IMG_SIZE:
        raise HTTPException(400, "Файл больше 8 МБ")
    os.makedirs(MESSAGE_IMG_DIR, exist_ok=True)
    ext = ALLOWED_IMG_TYPES[file.content_type]
    filename = f"{user.id}_{uuid.uuid4().hex}.{ext}"
    with open(f"{MESSAGE_IMG_DIR}/{filename}", "wb") as f:
        f.write(data)
    return {"url": f"/api/uploads/messages/{filename}"}


class MessageCreate(StrictIn):
    content: str = Field(min_length=1, max_length=4000)


def _pair(a: int, b: int) -> tuple[int, int]:
    return (a, b) if a < b else (b, a)


async def _get_or_create_conversation(db: AsyncSession, me: int, other: int) -> Conversation:
    lo, hi = _pair(me, other)
    conv = (await db.execute(
        select(Conversation).where(
            Conversation.user_a_id == lo, Conversation.user_b_id == hi
        )
    )).scalar_one_or_none()
    if not conv:
        conv = Conversation(user_a_id=lo, user_b_id=hi, last_message_at=datetime.now(timezone.utc).replace(tzinfo=None))
        db.add(conv)
        await db.flush()
    return conv


@router.get("/conversations", response_model=list[ConversationOut])
async def list_conversations(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    convs = (await db.execute(
        select(Conversation)
        .where(or_(Conversation.user_a_id == user.id, Conversation.user_b_id == user.id))
        .order_by(Conversation.last_message_at.desc())
    )).scalars().all()

    result = []
    for c in convs:
        other_id = c.user_b_id if c.user_a_id == user.id else c.user_a_id
        other = (await db.execute(select(User).where(User.id == other_id))).scalar_one_or_none()
        if not other:
            continue
        last_msg = (await db.execute(
            select(Message).where(Message.conversation_id == c.id)
            .order_by(Message.created_at.desc()).limit(1)
        )).scalar_one_or_none()
        unread = (await db.execute(
            select(func.count()).select_from(Message).where(
                Message.conversation_id == c.id,
                Message.author_id != user.id,
                Message.read == False,  # noqa: E712
            )
        )).scalar()
        result.append(ConversationOut(
            id=c.id,
            other_user_id=other.id,
            other_username=other.username,
            other_display_name=other.display_name or other.username,
            other_avatar_url=other.avatar_url,
            last_message=last_msg.content if last_msg else None,
            last_message_at=c.last_message_at,
            unread_count=unread or 0,
        ))
    return result


@router.get("/conversations/{username}", response_model=list[MessageOut])
async def get_conversation_with(username: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    other = (await db.execute(select(User).where(User.username == username))).scalar_one_or_none()
    if not other:
        raise HTTPException(404, "Пользователь не найден")
    if other.id == user.id:
        raise HTTPException(400, "Нельзя написать самому себе")

    lo, hi = _pair(user.id, other.id)
    conv = (await db.execute(
        select(Conversation).where(Conversation.user_a_id == lo, Conversation.user_b_id == hi)
    )).scalar_one_or_none()
    if not conv:
        return []

    msgs = (await db.execute(
        select(Message).where(Message.conversation_id == conv.id).order_by(Message.created_at.asc())
    )).scalars().all()

    unread_ids = [m.id for m in msgs if m.author_id != user.id and not m.read]
    if unread_ids:
        for m in msgs:
            if m.id in unread_ids:
                m.read = True
        await db.commit()

    return msgs


@router.post("/conversations/{username}", response_model=MessageOut, status_code=201)
async def send_message(username: str, body: MessageCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    other = (await db.execute(select(User).where(User.username == username))).scalar_one_or_none()
    if not other:
        raise HTTPException(404, "Пользователь не найден")
    if other.id == user.id:
        raise HTTPException(400, "Нельзя написать самому себе")

    conv = await _get_or_create_conversation(db, user.id, other.id)
    msg = Message(conversation_id=conv.id, author_id=user.id, content=body.content, read=False)
    db.add(msg)
    conv.last_message_at = datetime.now(timezone.utc).replace(tzinfo=None)
    await db.commit()
    await db.refresh(msg)

    prefs = (await db.execute(select(NotificationPrefs).where(NotificationPrefs.user_id == other.id))).scalar_one_or_none()
    if prefs is None or prefs.new_messages:
        # Превью содержимого сообщения в письме убрано намеренно (приватность
        # ЛС) — письмо только уведомляет о факте сообщения, текст читается
        # исключительно внутри Meridian.
        sender_name = user.display_name or user.username
        reply_url = f"https://miridin.com/messages/{user.username}"

        unread_result = await db.execute(
            select(func.count()).select_from(Message).where(
                Message.conversation_id == conv.id,
                Message.author_id == user.id,
                Message.read == False,  # noqa: E712
            )
        )
        unread_total = unread_result.scalar_one()
        unread_line = (
            f'<p style="margin:8px 0 0 0;font-size:13px;color:rgba(242,239,233,0.45);">'
            f'Непрочитанных от {esc(sender_name)}: {unread_total}</p>'
        ) if unread_total > 1 else ""

        await send_email(
            to=other.email,
            subject=f"{sender_name} написал(а) вам в Meridian",
            body=f"{sender_name} написал(а) вам новое сообщение.\n\nОтветить: {reply_url}",
            html=render_email_html(
                preheader=esc(f"{sender_name} написал(а) вам новое сообщение"),
                body_html=(
                    f'<p style="margin:0 0 8px 0;">'
                    f'<strong>{esc(sender_name)}</strong> написал(а) вам новое сообщение.</p>'
                    f'{unread_line}'
                    f'{email_button(reply_url, "Ответить")}'
                ),
            ),
        )

    return msg


@router.get("/unread-count")
async def unread_count(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    convs = (await db.execute(
        select(Conversation.id).where(or_(Conversation.user_a_id == user.id, Conversation.user_b_id == user.id))
    )).scalars().all()
    if not convs:
        return {"count": 0}
    count = (await db.execute(
        select(func.count()).select_from(Message).where(
            Message.conversation_id.in_(convs),
            Message.author_id != user.id,
            Message.read == False,  # noqa: E712
        )
    )).scalar()
    return {"count": count or 0}
