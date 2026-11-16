from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.lab_access import get_live, parent_alive_subquery
from app.db.session import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.entities import ContradictionFeedback
from app.schemas.entities import ContradictionCheckRequest, ContradictionFeedbackVerdict
from app.services.contradictions import check_contradictions
from app.services.repost import ENTITY_MODELS
from app.db.redis import redis_client

router = APIRouter(prefix="/contradictions", tags=["contradictions"])

RATE_LIMIT_MAX = 10       # вызовов
RATE_LIMIT_WINDOW = 60    # секунд


async def _check_rate_limit(user_id: int) -> None:
    """Простой fixed-window rate-limit через Redis — не больше
    RATE_LIMIT_MAX вызовов /check за RATE_LIMIT_WINDOW секунд на
    пользователя. Каждый вызов — тяжёлый запрос к локальной Ollama
    (embedding + LLM), защита от случайного/намеренного дублирования
    кликов и от прямого вызова API в обход UI."""
    key = f"contradictions:ratelimit:{user_id}"
    count = await redis_client.incr(key)
    if count == 1:
        await redis_client.expire(key, RATE_LIMIT_WINDOW)
    if count > RATE_LIMIT_MAX:
        raise HTTPException(429, "Слишком много проверок подряд, попробуйте через минуту")


@router.post("/check")
async def check(
    payload: ContradictionCheckRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Явный вызов по кнопке "проверить" — не автоматический триггер
    на каждое сохранение (см. обсуждение патернализма в чате)."""
    # Кнопка на фронте скрыта для не-владельцев, но это только UX —
    # без серверной проверки чужой entity_id/entity_type можно было
    # передать напрямую через API и получить чужие данные на сравнение.
    model = ENTITY_MODELS.get(payload.entity_type)
    if model is None:
        raise HTTPException(400, "Неизвестный тип сущности")
    entity = await get_live(db, model, payload.entity_id)
    if entity is None or entity.user_id != user.id:
        raise HTTPException(403, "Нет доступа к этой сущности")

    await _check_rate_limit(user.id)

    results = await check_contradictions(db, user.id, payload.text, payload.entity_type, payload.entity_id)

    # Логируем каждое найденное противоречие как pending-фидбек —
    # накопление golden-set начинается с первого же вызова.
    saved_ids = []
    for item in results:
        fb = ContradictionFeedback(
            user_id=user.id,
            source_entity_type=payload.entity_type,
            source_entity_id=payload.entity_id,
            matched_entity_type=item["entity_type"],
            matched_entity_id=item["entity_id"],
            existing_quote=item["existing_quote"],
            new_quote=item["new_quote"],
            relation=item["relation"],
            confidence=item["confidence"],
            verdict="pending",
        )
        db.add(fb)
        await db.flush()
        saved_ids.append(fb.id)
    await db.commit()

    return [{"feedback_id": fid, **item} for fid, item in zip(saved_ids, results)]


@router.post("/{feedback_id}/verdict")
async def set_verdict(
    feedback_id: int,
    payload: ContradictionFeedbackVerdict,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if payload.verdict not in ("accepted", "rejected"):
        raise HTTPException(400, "verdict должен быть accepted или rejected")

    fb = (await db.execute(
        select(ContradictionFeedback).where(
            ContradictionFeedback.id == feedback_id,
            ContradictionFeedback.user_id == user.id,
        )
    )).scalar_one_or_none()
    if not fb:
        raise HTTPException(404, "Запись не найдена")

    fb.verdict = payload.verdict
    await db.commit()
    return {"ok": True}


@router.get("/pending")
async def list_pending(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Список непросмотренных предложенных противоречий пользователя —
    используется фронтендом, чтобы показать, что есть что проверить,
    без повторного вызова дорогого LLM-пайплайна."""
    rows = (await db.execute(
        select(ContradictionFeedback)
        .where(
            ContradictionFeedback.user_id == user.id,
            ContradictionFeedback.verdict == "pending",
            parent_alive_subquery(ContradictionFeedback.source_entity_type, ContradictionFeedback.source_entity_id),
            parent_alive_subquery(ContradictionFeedback.matched_entity_type, ContradictionFeedback.matched_entity_id),
        )
        .order_by(ContradictionFeedback.created_at.desc())
    )).scalars().all()

    return [
        {
            "feedback_id": r.id,
            "source_entity_type": r.source_entity_type,
            "source_entity_id": r.source_entity_id,
            "entity_type": r.matched_entity_type,
            "entity_id": r.matched_entity_id,
            "existing_quote": r.existing_quote,
            "new_quote": r.new_quote,
            "relation": r.relation,
            "confidence": r.confidence,
            "created_at": r.created_at.isoformat(),
        }
        for r in rows
    ]
