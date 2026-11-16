import asyncio
import json
import signal
import time
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.lab_access import get_live
from app.db.session import AsyncSessionLocal
from app.db.redis import redis_client
from app.services.contradictions import check_contradictions
from app.services.session_purge import purge_dead_sessions
from app.models.entities import Observation, Hypothesis, Prediction, ContradictionFeedback

_ENTITY_TEXT_SOURCE = {
    "observation": lambda e: e.text,
    "hypothesis":  lambda e: f"{e.name}. {e.description or ''}",
    "prediction":  lambda e: e.text,
}
_ENTITY_MODELS = {
    "observation": Observation,
    "hypothesis": Hypothesis,
    "prediction": Prediction,
}

QUEUE_KEY = "recheck:queue"
SESSION_PURGE_INTERVAL = 24 * 3600  # мертвые сессии (IP и браузер) чистим раз в сутки, в том числе у тех, кто больше не заходит
RUNNING = True

async def process_one(task: dict) -> None:
    user_id = task["user_id"]
    entity_type = task["entity_type"]
    entity_id = task["entity_id"]
    
    model = _ENTITY_MODELS.get(entity_type)
    text_fn = _ENTITY_TEXT_SOURCE.get(entity_type)
    if not model or not text_fn:
        return
    
    async with AsyncSessionLocal() as db:
        entity = await get_live(db, model, entity_id)
        if not entity:
            return
        
        # Пропускаем факты (та же логика, что в старом recheck)
        if entity_type == "observation" and getattr(entity, "content_kind", None) == "fact":
            return
        
        text = text_fn(entity)
        try:
            results = await asyncio.wait_for(
                check_contradictions(db, user_id, text, entity_type, entity_id),
                timeout=60.0
            )
            for item in results:
                db.add(ContradictionFeedback(
                    user_id=user_id,
                    source_entity_type=entity_type,
                    source_entity_id=entity_id,
                    matched_entity_type=item["entity_type"],
                    matched_entity_id=item["entity_id"],
                    existing_quote=item["existing_quote"],
                    new_quote=item["new_quote"],
                    relation=item["relation"],
                    confidence=item["confidence"],
                    verdict="pending",
                ))
            await db.commit()
        except asyncio.TimeoutError:
            print(f"[recheck-worker] timeout on ({entity_type}, {entity_id})", flush=True)
        except Exception as e:
            print(f"[recheck-worker] error on ({entity_type}, {entity_id}): {e}", flush=True)
            await db.rollback()

def purge_due(last: float | None, now: float, interval: float = SESSION_PURGE_INTERVAL) -> bool:
    return last is None or now - last >= interval


async def purge_sessions_once() -> int:
    async with AsyncSessionLocal() as db:
        removed = await purge_dead_sessions(db)
        await db.commit()
        return removed


async def main():
    global RUNNING
    def handle_signal(*_):
        RUNNING = False
    signal.signal(signal.SIGTERM, handle_signal)
    signal.signal(signal.SIGINT, handle_signal)
    
    print("[recheck-worker] started", flush=True)
    last_purge: float | None = None
    while RUNNING:
        if purge_due(last_purge, time.monotonic()):
            last_purge = time.monotonic()
            try:
                print(f"[recheck-worker] удалено мертвых сессий: {await purge_sessions_once()}", flush=True)
            except Exception as e:
                print(f"[recheck-worker] очистка сессий не удалась: {e}", flush=True)
        try:
            result = await redis_client.blpop(QUEUE_KEY, timeout=5)
            if result is None:
                continue
            _, raw = result
            task = json.loads(raw)
            await process_one(task)
            await asyncio.sleep(2)  # troughput throttle — не долбим LLM API залпом при накопленном backlog
        except Exception as e:
            print(f"[recheck-worker] loop error: {e}", flush=True)
            await asyncio.sleep(5)
    print("[recheck-worker] shutting down", flush=True)

if __name__ == "__main__":
    asyncio.run(main())
