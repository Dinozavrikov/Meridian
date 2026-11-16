"""
Отложенная переоценка: раз в сутки проверяет старые записи (Наблюдения/
Гипотезы/Прогнозы), которые давно не проверялись на противоречия
(last_checked_at IS NULL или старше RECHECK_AFTER_DAYS), на предмет
несостыковок с тем, что появилось в базе с тех пор. Тот же принцип,
что и ручная кнопка "Проверить" (contradictions.py), но без клика
пользователя — результат просто появляется в GET /pending.
"""
from datetime import datetime, timezone, timedelta
from sqlalchemy import select, or_
from app.core.lab_access import parent_alive_subquery
from app.db.session import AsyncSessionLocal
from app.db.redis import redis_client
import json
from app.models.entities import Observation, Hypothesis, Prediction, EntityEmbedding, ContradictionFeedback
from app.services.contradictions import check_contradictions

RECHECK_AFTER_DAYS = 14
BATCH_LIMIT = 50  # не тащим весь корпус разом — ограничиваем LLM-вызовы за один прогон

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


async def run_delayed_recheck():
    """Вызывается по расписанию (см. main.py). Вместо прямого вызова LLM
    кладёт задачи в Redis-очередь — worker разбирает их в отдельном
    процессе, не блокируя event loop бэкенда."""
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    age_cutoff = now - timedelta(days=RECHECK_AFTER_DAYS)

    async with AsyncSessionLocal() as db:
        embeddings = (await db.execute(
            select(EntityEmbedding)
            .where(
                EntityEmbedding.created_at <= age_cutoff,
                # запись в корзине не выбираем: без этого бессрочная корзина забила бы голову очереди
                # (last_checked_at NULLS FIRST + limit), и живые записи не доходили бы до проверки
                parent_alive_subquery(EntityEmbedding.entity_type, EntityEmbedding.entity_id),
                or_(
                    EntityEmbedding.last_checked_at.is_(None),
                    EntityEmbedding.last_checked_at <= age_cutoff,
                ),
            )
            .order_by(EntityEmbedding.last_checked_at.asc().nulls_first())
            .limit(BATCH_LIMIT)
        )).scalars().all()

        for emb in embeddings:
            model = _ENTITY_MODELS.get(emb.entity_type)
            if not model:
                continue

            entity = await db.get(model, emb.entity_id)
            if not entity:
                continue  # сущность удалена, эмбеддинг осиротел

            if emb.entity_type == "observation" and getattr(entity, "content_kind", None) == "fact":
                emb.last_checked_at = now
                continue

            # Кладём в очередь вместо синхронного вызова LLM
            task = {
                "user_id": emb.user_id,
                "entity_type": emb.entity_type,
                "entity_id": emb.entity_id,
            }
            await redis_client.rpush("recheck:queue", json.dumps(task))
            emb.last_checked_at = now

        await db.commit()
