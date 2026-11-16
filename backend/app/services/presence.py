"""
Presence: кто сейчас на связи и кто печатает.

Онлайн — TTL-ключ в Redis (presence:online:{user_id}), продлевается хартбитом
с фронтенда раз в 20с и живёт 45с. Не нужно явно помечать "оффлайн" при
закрытии вкладки/потере сети — короткий TTL сделает это сам.

Печатает — нигде не хранится, только pub/sub-событие в канале конкретного
диалога. Нечего чистить, если событие потерялось — оно эфемерно по своей
природе, а не флаг, который можно забыть сбросить.
"""
import json
from typing import AsyncIterator
from redis.asyncio import Redis

ONLINE_TTL_SECONDS = 45


def _online_key(user_id: int) -> str:
    return f"presence:online:{user_id}"


def _channel(conversation_id: int) -> str:
    return f"presence:chan:{conversation_id}"


class PresenceService:
    def __init__(self, redis: Redis):
        self.redis = redis

    async def heartbeat(self, user_id: int) -> None:
        await self.redis.set(_online_key(user_id), "1", ex=ONLINE_TTL_SECONDS)

    async def mark_offline(self, user_id: int) -> None:
        await self.redis.delete(_online_key(user_id))

    async def publish(self, conversation_id: int, payload: dict) -> None:
        await self.redis.publish(_channel(conversation_id), json.dumps(payload))

    async def subscribe(self, conversation_id: int) -> AsyncIterator[dict]:
        pubsub = self.redis.pubsub()
        await pubsub.subscribe(_channel(conversation_id))
        try:
            while True:
                # timeout=30s — периодически просыпаемся, чтобы ловить
                # CancelledError при отключении клиента и не течь вечно
                message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=30.0)
                if message is None:
                    continue
                if message["type"] == "message":
                    yield json.loads(message["data"])
        finally:
            await pubsub.unsubscribe(_channel(conversation_id))
            await pubsub.aclose()
