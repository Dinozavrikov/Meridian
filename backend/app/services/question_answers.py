"""
Точка входа для поиска возможных ответов на открытые Вопросы пользователя
из его же корпуса (Наблюдения/Гипотезы/Прогнозы — единственные сущности
с эмбеддингами, см. embeddings.py). Два режима использования:

- check_by_click — explicit, по клику на странице конкретного вопроса,
  ищет по всему корпусу пользователя (см. философию "явный клик, не
  автотриггер" из contradictions.py / reflection-nudge).
- check_on_save — implicit, вызывается best-effort из BackgroundTasks при
  сохранении любой сущности; ищет среди ОТКРЫТЫХ вопросов ТОГО ЖЕ user_id,
  что и сохранённая сущность — фильтрация по user_id всегда на уровне SQL,
  чужой вопрос физически не может попасть в кандидаты (см. обсуждение
  приватности при проектировании фичи).

Дедуп: перед вызовом LLM (дорогой шаг) сверяемся с уже существующими
QuestionAnswerFeedback по паре (question_id, source_entity_type,
source_entity_id) — не показываем повторно то, что уже когда-то предложили,
независимо от вердикта. Это дешёвый SQL-запрос, отсекающий повторные LLM-
вызовы на одни и те же пары при многократном редактировании записи.
"""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.entities import Question, QuestionAnswerFeedback
from app.services.embeddings import get_embedding, similar_candidates, similar_open_questions
from app.services.ai import find_question_answers


async def _search_candidates(db: AsyncSession, user_id: int, question_text: str, top_k: int = 8) -> list[dict]:
    """Кандидаты-ОТВЕТЫ ищутся только среди Observation/Hypothesis/Prediction
    — реальных записей, которые могут что-то отвечать. Question исключён
    явно: после того как мы завели эмбеддинги и для вопросов (нужны для
    top-k поиска ближайших вопросов в check_on_save), без этого фильтра
    сюда попадали другие вопросы пользователя и даже сам проверяемый
    вопрос — LLM однажды "нашёл", что вопрос отвечает сам на себе
    (см. баг, обнаруженный при тестировании)."""
    vec = await get_embedding(question_text)
    if vec is None:
        return []
    rows = await similar_candidates(db, user_id, vec, exclude_types=("question",), limit=top_k)
    return [{"entity_type": r.entity_type, "entity_id": r.entity_id, "text": r.text_snapshot} for r in rows]


async def _filter_new_pairs(db: AsyncSession, question_id: int, candidates: list[dict]) -> list[dict]:
    """Убирает кандидатов, для которых уже есть запись в QuestionAnswerFeedback
    (любого вердикта) — дешёвая проверка перед дорогим вызовом LLM."""
    if not candidates:
        return []
    existing = (await db.execute(
        select(QuestionAnswerFeedback.source_entity_type, QuestionAnswerFeedback.source_entity_id)
        .where(QuestionAnswerFeedback.question_id == question_id)
    )).all()
    seen = {(t, i) for t, i in existing}
    return [c for c in candidates if (c["entity_type"], c["entity_id"]) not in seen]


async def check_by_click(db: AsyncSession, question_id: int, user_id: int) -> list[dict]:
    """Explicit-проверка по клику на странице вопроса — ищет по всему
    корпусу пользователя, включая уже когда-то отклонённые пары исключает
    через _filter_new_pairs (не показываем повторно отклонённое)."""
    question = await db.get(Question, question_id)
    if not question or question.user_id != user_id:
        return []
    candidates = await _search_candidates(db, user_id, question.text or question.title, top_k=8)
    candidates = await _filter_new_pairs(db, question_id, candidates)
    if not candidates:
        return []
    return await find_question_answers(question.text or question.title, candidates)


async def check_on_save(db: AsyncSession, user_id: int, saved_entity_type: str, saved_entity_id: int, text: str, top_k: int = 3, vec: list[float] | None = None) -> list[dict]:
    """Implicit-проверка при сохранении сущности — best-effort, вызывается
    из BackgroundTasks. Раньше перебирала ВСЕ открытые вопросы пользователя
    циклом (по LLM-вызову на каждый — O(N) дорогих вызовов на одно
    сохранение). Теперь — один векторный поиск top_k БЛИЖАЙШИХ по смыслу
    открытых вопросов (через эмбеддинг сохранённой сущности), и только по
    ним, максимум top_k, идёт дорогой LLM-вызов (см. обсуждение стоимости
    масштабирования в чате при ревью фичи).

    Ищет среди открытых вопросов ТОГО ЖЕ пользователя, не среди всех
    вопросов в системе. Возвращает список найденных пар (question_id,
    quote, confidence, ...) для последующей записи в QuestionAnswerFeedback
    вызывающим кодом — сама функция не пишет в БД, чтобы вызывающий код мог
    явно закоммитить транзакцию с сохранением исходной сущности (или не
    закоммитить при сбое) без риска рассинхрона.

    Best-effort: любая ошибка (недоступность LLM/эмбеддингов) должна тихо
    проглатываться ВЫЗЫВАЮЩИМ кодом — эта функция сама не роняет исключение
    наружу дальше find_question_answers/get_embedding (они уже best-effort),
    но сетевые сбои БД тут не перехватываются намеренно: если сама БД
    недоступна, основной флоу сохранения сущности и так уже упал раньше."""
    vec = vec if vec is not None else await get_embedding(text)
    if vec is None:
        return []

    rows = await similar_open_questions(db, user_id, vec, limit=top_k)
    if not rows:
        return []

    results = []
    for emb in rows:
        q = await db.get(Question, emb.entity_id)
        if not q:
            continue
        candidates = [{"entity_type": saved_entity_type, "entity_id": saved_entity_id, "text": text}]
        candidates = await _filter_new_pairs(db, q.id, candidates)
        if not candidates:
            continue
        found = await find_question_answers(q.text or q.title, candidates)
        for item in found:
            results.append({"question_id": q.id, **item})
    return results



async def run_check_on_save_background(user_id: int, saved_entity_type: str, saved_entity_id: int, text: str) -> None:
    """Обёртка для вызова из BackgroundTasks после сохранения любой сущности
    с эмбеддингом (Observation/Hypothesis/Prediction) — открывает свою
    сессию (request-scoped db уже закрыта к моменту выполнения фоновой
    задачи, тот же паттерн, что _process_source в sources.py и
    generate_image_description в entity_image_description.py), вызывает
    check_on_save и сама пишет найденные пары в QuestionAnswerFeedback.

    Best-effort: любая ошибка (недоступность LLM/эмбеддингов, сбой БД)
    молча логируется и проглатывается — эта задача не должна ронять
    ничего, основной флоу сохранения сущности уже завершился и отдал
    ответ клиенту до её запуска."""
    from app.db.session import AsyncSessionLocal

    try:
        async with AsyncSessionLocal() as db:
            results = await check_on_save(db, user_id, saved_entity_type, saved_entity_id, text)
            for item in results:
                fb = QuestionAnswerFeedback(
                    user_id=user_id,
                    question_id=item["question_id"],
                    source_entity_type=item["entity_type"],
                    source_entity_id=item["entity_id"],
                    matched_quote=item["quote"],
                    confidence=item["confidence"],
                    verdict="pending",
                )
                db.add(fb)
            if results:
                await db.commit()
    except Exception as e:
        print(f"[question-answers] фоновая проверка упала (best-effort, не критично): {e}", flush=True)
