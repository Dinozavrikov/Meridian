"""
WebSocket presence: /api/v1/ws/presence/{username}

Один сокет на открытую вкладку диалога. Аутентификация — тот же
access_token cookie, что и обычные REST-запросы: сокет открывается с того
же origin, cookie уезжает автоматически, отдельный токен не нужен.
"""
import json
import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Cookie, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.session import get_db
from app.db.redis import redis_client
from app.core.security import decode_token
from app.models.user import User
from app.services.presence import PresenceService
from app.api.v1.messages import _get_or_create_conversation

router = APIRouter(tags=["presence"])


@router.websocket("/ws/presence/{username}")
async def presence_socket(
    websocket: WebSocket,
    username: str,
    access_token: str | None = Cookie(None),
    db: AsyncSession = Depends(get_db),
):
    if not access_token:
        await websocket.close(code=4401)
        return
    me_username = decode_token(access_token)
    if not me_username:
        await websocket.close(code=4401)
        return

    me = (await db.execute(select(User).where(User.username == me_username))).scalar_one_or_none()
    other = (await db.execute(select(User).where(User.username == username))).scalar_one_or_none()
    if not me or not other or me.id == other.id:
        await websocket.close(code=4404)
        return

    conv = await _get_or_create_conversation(db, me.id, other.id)
    await db.commit()

    await websocket.accept()
    presence = PresenceService(redis_client)
    await presence.heartbeat(me.id)
    await presence.publish(conv.id, {"type": "presence", "userId": me.id, "online": True})

    async def relay():
        async for event in presence.subscribe(conv.id):
            if event.get("userId") == me.id:
                continue
            try:
                await websocket.send_text(json.dumps(event))
            except Exception:
                return

    relay_task = asyncio.create_task(relay())

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue
            t = msg.get("type")
            if t == "ping":
                await presence.heartbeat(me.id)
            elif t == "typing":
                await presence.publish(conv.id, {"type": "typing", "userId": me.id})
            elif t == "stop_typing":
                await presence.publish(conv.id, {"type": "stop_typing", "userId": me.id})
    except WebSocketDisconnect:
        pass
    finally:
        relay_task.cancel()
        await presence.mark_offline(me.id)
        await presence.publish(conv.id, {"type": "presence", "userId": me.id, "online": False})
