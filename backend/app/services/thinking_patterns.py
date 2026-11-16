from sqlalchemy import select, func
from datetime import datetime, timezone
from app.db.session import AsyncSessionLocal
from app.models.entities import Prediction, EntityReflection, EntityReflectionInsight, UserThinkingPattern
from app.models.social import EntityComment
from app.services.ai import generate_thinking_pattern_summary

MIN_RESOLUTIONS = 8   # порог для первого обзора (review.md п.12)
NEW_RESOLUTIONS_STEP = 5  # триггер — не по календарю, а по накоплению данных


async def _count_eligible_resolutions(db, user_id: int) -> int:
    """Сколько прогнозов пользователя имеют рефлексию на ОБЕИХ стадиях —
    то же условие, что при ручной проверке в чате при проектировании фичи."""
    q = (
        select(func.count(func.distinct(Prediction.id)))
        .select_from(Prediction)
        .where(
            Prediction.user_id == user_id,
            Prediction.id.in_(select(EntityReflection.entity_id).where(EntityReflection.entity_type == "prediction", EntityReflection.stage == "creation")),
            Prediction.id.in_(select(EntityReflection.entity_id).where(EntityReflection.entity_type == "prediction", EntityReflection.stage == "resolution")),
        )
    )
    return (await db.execute(q)).scalar_one()


async def maybe_generate_thinking_pattern(user_id: int):
    """Вызывается после каждого resolution-diff (см. run_resolution_diff).
    Проверяет порог/триггер и генерирует новую запись в ленте, если пора —
    иначе тихо ничего не делает. Best-effort, не бросает исключения наружу."""
    async with AsyncSessionLocal() as db:
        total = await _count_eligible_resolutions(db, user_id)
        if total < MIN_RESOLUTIONS:
            return

        latest = (await db.execute(
            select(UserThinkingPattern)
            .where(UserThinkingPattern.user_id == user_id)
            .order_by(UserThinkingPattern.created_at.desc())
            .limit(1)
        )).scalar_one_or_none()

        if latest and (total - latest.based_on_count) < NEW_RESOLUTIONS_STEP:
            return  # накопилось недостаточно нового с прошлого обзора

        # Собираем вход: инсайты по прогнозам пользователя + личные выводы
        insight_rows = (await db.execute(
            select(EntityReflectionInsight.insight)
            .join(Prediction, Prediction.id == EntityReflectionInsight.entity_id)
            .where(EntityReflectionInsight.entity_type == "prediction", Prediction.user_id == user_id)
            .order_by(EntityReflectionInsight.created_at.desc())
            .limit(50)  # не тащим неограниченно — не масштабируется по стоимости промта
        )).scalars().all()
        insights = [i for i in insight_rows if i]

        conclusion_rows = (await db.execute(
            select(EntityComment.content)
            .where(
                EntityComment.entity_type == "prediction",
                EntityComment.author_id == user_id,
                EntityComment.source == "reflection_followup",
            )
            .order_by(EntityComment.created_at.desc())
            .limit(50)
        )).scalars().all()
        conclusions = [c for c in conclusion_rows if c]

        if not insights:
            return  # нечего агрегировать, несмотря на пройденный порог по резолюциям

        summary = await generate_thinking_pattern_summary(insights, conclusions)
        if not summary:
            return  # ИИ недоступен/ошибка — не создаём пустую запись в ленте

        pattern = UserThinkingPattern(
            user_id=user_id, summary=summary, based_on_count=total,
            created_at=datetime.now(timezone.utc),
        )
        db.add(pattern)
        await db.commit()
