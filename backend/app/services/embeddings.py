"""
Индексация сущностей в entity_embeddings и семантический поиск похожих записей через pgvector
(cosine distance). Используется для поиска противоречий (services/contradictions.py), подбора наблюдений
к гипотезе, ответов на вопросы, кластеризации источников.

ЕДИНАЯ ТОЧКА ЧТЕНИЯ ВЕКТОРОВ. Векторы разных моделей несовместимы: косинусная близость между ними — шум,
а размерность колонки (1024) может совпасть, и ошибки не будет. Поэтому каждый вектор помечен моделью
(entity_embeddings.embedding_model), а ВСЕ запросы по векторам идут отсюда и берут только векторы текущей
модели (llm_router, задача embedding). После смены модели старые векторы не участвуют в поиске (поиск
честно пуст, а не даёт мусор), пока их не пересчитают: scripts/reembed_embeddings.py.
Обход этого модуля запрещён: tests/test_embedding_guard.py.

Best-effort везде: если Ollama недоступна, индексация/поиск тихо пропускаются — это фоновая аналитика,
она не должна ронять основной флоу сохранения Наблюдения/Гипотезы/Прогноза.
"""
from sqlalchemy import select, delete, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.lab_access import parent_alive_subquery
from app.models.entities import EntityEmbedding, Question
from app.services.ai import get_embedding, embed
from app.services.llm_router import resolve, TASK_EMBEDDING


def current_embedding_model() -> str:
    """Модель, которой сейчас считаются эмбеддинги (LLM_EMBEDDING_MODEL / OLLAMA_EMBED_MODEL)."""
    return resolve(TASK_EMBEDDING).model


def similar_query(user_id: int, vec: list[float]):
    """Базовый запрос «ближайшие векторы пользователя»: только текущая модель, по косинусной близости.
    Вызывающий добавляет свои .where() / .join() / .limit()."""
    return (
        select(EntityEmbedding)
        .where(
            EntityEmbedding.user_id == user_id,
            EntityEmbedding.embedding_model == current_embedding_model(),
        )
        .where(parent_alive_subquery(EntityEmbedding.entity_type, EntityEmbedding.entity_id))
        .order_by(EntityEmbedding.embedding.cosine_distance(vec))
    )


def candidates_query(user_id: int, vec: list[float], exclude_types: tuple[str, ...] = ()):
    query = similar_query(user_id, vec)
    if exclude_types:
        query = query.where(EntityEmbedding.entity_type.not_in(exclude_types))
    return query


def open_questions_query(user_id: int, vec: list[float]):
    return (
        similar_query(user_id, vec)
        .join(Question, Question.id == EntityEmbedding.entity_id)
        .where(EntityEmbedding.entity_type == "question", Question.status == "открыт")
    )


async def similar_candidates(db: AsyncSession, user_id: int, vec: list[float], *,
                             exclude_types: tuple[str, ...] = (), limit: int = 8) -> list[EntityEmbedding]:
    return list((await db.execute(candidates_query(user_id, vec, exclude_types).limit(limit))).scalars().all())


async def similar_open_questions(db: AsyncSession, user_id: int, vec: list[float], limit: int = 3) -> list[EntityEmbedding]:
    return list((await db.execute(open_questions_query(user_id, vec).limit(limit))).scalars().all())


async def vectors_for(db: AsyncSession, entity_type: str, entity_ids: list[int]) -> dict[int, list[float]]:
    """Векторы конкретных сущностей (текущая модель). Сущности без вектора текущей модели в результат не
    попадают — вызывающий трактует их как «эмбеддинга нет»."""
    if not entity_ids:
        return {}
    rows = (await db.execute(
        select(EntityEmbedding).where(
            EntityEmbedding.entity_type == entity_type,
            EntityEmbedding.entity_id.in_(entity_ids),
            parent_alive_subquery(EntityEmbedding.entity_type, EntityEmbedding.entity_id),
            EntityEmbedding.embedding_model == current_embedding_model(),
        )
    )).scalars().all()
    return {r.entity_id: r.embedding for r in rows}


_STALE_WARNED: set[tuple[int, str]] = set()


async def stale_embedding_count(db: AsyncSession, user_id: int | None = None) -> int:
    """Сколько векторов посчитано НЕ текущей моделью (не участвуют в поиске до пересчёта)."""
    query = select(func.count()).select_from(EntityEmbedding).where(
        EntityEmbedding.embedding_model != current_embedding_model()
    )
    if user_id is not None:
        query = query.where(EntityEmbedding.user_id == user_id)
    return (await db.execute(query)).scalar_one()


async def _warn_if_stale(db: AsyncSession, user_id: int) -> None:
    model = current_embedding_model()
    key = (user_id, model)
    if key in _STALE_WARNED:
        return
    stale = await stale_embedding_count(db, user_id)
    if stale:
        _STALE_WARNED.add(key)
        print(f"[embeddings] {stale} векторов пользователя {user_id} посчитаны другой моделью, чем текущая ({model}), "
              "и не участвуют в поиске — пересчитайте: env PYTHONPATH=/app python3 scripts/reembed_embeddings.py", flush=True)


async def log_stale_embeddings() -> None:
    """При старте приложения: видно в логе, если после смены модели остались непересчитанные векторы."""
    try:
        from app.db.session import AsyncSessionLocal
        async with AsyncSessionLocal() as db:
            stale = await stale_embedding_count(db)
        if stale:
            print(f"[embeddings] при старте: {stale} векторов посчитаны не текущей моделью ({current_embedding_model()}) "
                  "и не участвуют в поиске — env PYTHONPATH=/app python3 scripts/reembed_embeddings.py", flush=True)
    except Exception as e:
        print(f"[embeddings] не удалось проверить векторы при старте: {type(e).__name__}: {e}", flush=True)


async def upsert_entity_embedding(db: AsyncSession, user_id: int, entity_type: str, entity_id: int, text: str, precomputed=None):
    """Пересчитывает и сохраняет эмбеддинг сущности вместе с меткой модели. Вызывается после
    create/update Observation/Hypothesis/Prediction/Worldview/Question. Не коммитит сама — вызывающий код
    коммитит вместе с основной транзакцией сохранения сущности, чтобы не плодить лишние round-trip'ы к БД.

    precomputed — уже посчитанный Embedded (см. app.services.ai.Embedded), если вызывающий код
    (services/entity_postprocess.py) уже сходил в Ollama сам и не хочет второго round-trip'а на тот же
    текст. Возвращает Embedded (или None при недоступности Ollama) — тоже для переиспользования
    вызывающим кодом (implicit-проверка вопросов на том же векторе, без повторного embed())."""
    if not text or not text.strip():
        return None
    emb = precomputed if precomputed is not None else await embed(text)
    if emb is None:
        return None  # Ollama недоступна — пропускаем, не роняем сохранение сущности

    existing = (await db.execute(
        select(EntityEmbedding).where(
            EntityEmbedding.entity_type == entity_type,
            EntityEmbedding.entity_id == entity_id,
        )
    )).scalar_one_or_none()

    if existing:
        existing.text_snapshot = text
        existing.embedding = emb.vector
        existing.embedding_model = emb.model
    else:
        db.add(EntityEmbedding(
            user_id=user_id, entity_type=entity_type, entity_id=entity_id,
            text_snapshot=text, embedding=emb.vector, embedding_model=emb.model,
        ))
    return emb


async def delete_entity_embedding(db: AsyncSession, entity_type: str, entity_id: int) -> None:
    """Вызывается при удалении сущности — не оставляем осиротевший эмбеддинг."""
    await db.execute(delete(EntityEmbedding).where(
        EntityEmbedding.entity_type == entity_type,
        EntityEmbedding.entity_id == entity_id,
    ))


async def find_similar(db: AsyncSession, user_id: int, text: str, exclude_entity_type: str, exclude_entity_id: int, top_k: int = 8, exclude_extra: list[tuple[str, int]] | None = None) -> list[dict]:
    """Возвращает top_k ближайших по смыслу существующих записей (кроме самой себя), с их id/type/text —
    для дальнейшей extractive проверки на противоречия через LLM. Не бросает исключение, если Ollama
    недоступна — возвращает пустой список (вызывающий код сам решает, что делать, например тихо промолчать).

    exclude_extra — дополнительные пары (entity_type, entity_id) для исключения из поиска. Например:
    связанную с прогнозом родительскую гипотезу, которую он намеренно проверяет "на прочность" —
    противоречие между прогнозом-контр-тестом и его же гипотезой это ожидаемый метод проверки, а не
    сигнал плохого мышления."""
    vec = await get_embedding(text)
    if vec is None:
        return []

    exclusions = [(exclude_entity_type, exclude_entity_id)] + (exclude_extra or [])
    exclude_clause = None
    for etype, eid in exclusions:
        cond = (EntityEmbedding.entity_type == etype) & (EntityEmbedding.entity_id == eid)
        exclude_clause = cond if exclude_clause is None else (exclude_clause | cond)

    rows = (await db.execute(
        similar_query(user_id, vec).where(~exclude_clause).limit(top_k)
    )).scalars().all()
    if not rows:
        await _warn_if_stale(db, user_id)

    return [
        {"entity_type": r.entity_type, "entity_id": r.entity_id, "text": r.text_snapshot}
        for r in rows
    ]


async def reembed_all_entities(db: AsyncSession, batch_size: int = 20, only_stale: bool = True) -> dict:
    """Пересчитывает сохранённые эмбеддинги текущей моделью (по text_snapshot) и обновляет метку модели.
    По умолчанию — только устаревшие (посчитанные другой моделью); only_stale=False — все. Идемпотентна;
    строка, для которой модель не ответила (или пустой снапшот), остаётся как была и попадает в failed."""
    model = current_embedding_model()
    base = select(EntityEmbedding)
    if only_stale:
        base = base.where(EntityEmbedding.embedding_model != model)
    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
    updated = failed = 0
    last_id = 0
    while True:
        rows = (await db.execute(
            base.where(EntityEmbedding.id > last_id).order_by(EntityEmbedding.id).limit(batch_size)
        )).scalars().all()
        if not rows:
            break
        for row in rows:
            last_id = row.id
            text = (row.text_snapshot or "").strip()
            emb = await embed(text) if text else None
            if emb is None:
                failed += 1
                continue
            row.embedding = emb.vector
            row.embedding_model = emb.model
            updated += 1
        await db.commit()
    return {"total": total, "updated": updated, "failed": failed}
