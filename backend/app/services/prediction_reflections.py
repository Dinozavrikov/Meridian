from sqlalchemy import select
from app.db.session import AsyncSessionLocal
from app.models.entities import EntityReflection, EntityReflectionInsight, EntityImage, Prediction
from app.services.ai import diff_reflections, AIUnavailable
from app.services.thinking_patterns import maybe_generate_thinking_pattern


async def _get_image_descriptions(db, prediction_id: int) -> list[str]:
    """Описания картинок прогноза (уже сгенерированные фоном при загрузке).
    Картинки без описания (vision ещё не отработал/недоступен) пропускаются —
    best-effort, не блокирует diff."""
    rows = (await db.execute(
        select(EntityImage.description).where(
            EntityImage.entity_type == "prediction",
            EntityImage.entity_id == prediction_id,
            EntityImage.description.is_not(None),
        )
    )).scalars().all()
    return [d for d in rows if d]


async def _get_reflection(db, prediction_id: int, stage: str, order: str):
    """Специфично для Prediction — entity_type зашит явно. Для Worldview
    используется отдельная функция ниже (там нет стадий creation/resolution)."""
    q = select(EntityReflection).where(
        EntityReflection.entity_type == "prediction",
        EntityReflection.entity_id == prediction_id,
        EntityReflection.stage == stage,
    )
    q = q.order_by(
        EntityReflection.created_at.desc() if order == "latest"
        else EntityReflection.created_at.asc()
    )
    return (await db.execute(q.limit(1))).scalar_one_or_none()


async def run_manual_diff(db, prediction_id: int) -> EntityReflectionInsight | None:
    """Ручной запрос 'промежуточного результата' — сравнивает самую первую
    и самую последнюю версию факторов ВНУТРИ стадии creation (резолюции
    ещё нет). Синхронный: пользователь сам нажал кнопку и ждёт ответ."""
    earliest = await _get_reflection(db, prediction_id, "creation", "earliest")
    latest = await _get_reflection(db, prediction_id, "creation", "latest")
    if not earliest or not latest or earliest.id == latest.id:
        return None  # нечего сравнивать — всего одна версия или ни одной

    images = await _get_image_descriptions(db, prediction_id)
    result = await diff_reflections(earliest.factors, latest.factors, image_descriptions=images)
    insight = EntityReflectionInsight(
        entity_type="prediction", entity_id=prediction_id,
        matched=result["matched"], added=result["added"], dropped=result["dropped"],
        insight=result["insight"], triggered_by="manual",
    )
    db.add(insight)
    await db.commit()
    await db.refresh(insight)
    return insight


async def run_resolution_diff(prediction_id: int):
    """Авто-запуск при закрытии прогноза. Выполняется как BackgroundTask —
    открывает СВОЮ сессию БД, т.к. запрос-инициатор уже завершится к моменту
    выполнения. Сравнивает последнюю creation с последней resolution."""
    async with AsyncSessionLocal() as db:
        creation = await _get_reflection(db, prediction_id, "creation", "latest")
        resolution = await _get_reflection(db, prediction_id, "resolution", "latest")
        if not creation or not resolution:
            return  # пользователь пропустил рефлексию на одной из стадий — нечего диффать (см. п.1.1)

        images = await _get_image_descriptions(db, prediction_id)
        try:
            result = await diff_reflections(creation.factors, resolution.factors, image_descriptions=images)
        except AIUnavailable:
            print(f"[reflections] авто-diff прогноза {prediction_id} пропущен: ИИ недоступен", flush=True)
            return  # лучше пустота, чем «вывод» из текста ошибки
        insight = EntityReflectionInsight(
            entity_type="prediction", entity_id=prediction_id,
            matched=result["matched"], added=result["added"], dropped=result["dropped"],
            insight=result["insight"], triggered_by="resolution",
        )
        db.add(insight)
        await db.commit()

        pred = await db.get(Prediction, prediction_id)
        user_id = pred.user_id if pred else None

    # Отдельно от инсайта конкретного прогноза — проверяем, не пора ли
    # сгенерировать агрегирующий обзор паттернов поперёк всех прогнозов.
    # Своя сессия внутри maybe_generate_thinking_pattern (не переиспользует
    # db выше — та сессия закрывается по выходу из async with).
    if user_id:
        await maybe_generate_thinking_pattern(user_id)
