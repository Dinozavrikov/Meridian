"""
Точка входа для поиска противоречий: связывает семантический поиск
(embeddings.find_similar) и extractive-проверку через LLM
(ai.find_contradictions) в один вызов. Вызывается явно по кнопке
"проверить" — не автоматически на каждую запись (см. обсуждение
патернализма в чате при проектировании фичи).
"""
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.entities import Prediction
from app.services.embeddings import find_similar
from app.services.ai import find_contradictions


async def check_contradictions(db: AsyncSession, user_id: int, text: str, entity_type: str, entity_id: int) -> list[dict]:
    exclude_extra: list[tuple[str, int]] = []
    source_annotation = ""

    # Прогноз может намеренно быть контр-тестом своей гипотезы (проверка
    # на прочность) — это ожидаемый метод, не сигнал плохого мышления.
    # Исключаем эту пару из поиска и добавляем уровень уверенности как
    # контекст для LLM (см. обсуждение в чате: confidence — недостающая
    # переменная, которая превращает "есть текстовое противоречие" в
    # "стоит ли вообще на это смотреть").
    if entity_type == "prediction":
        pred = await db.get(Prediction, entity_id)
        if pred:
            if pred.hypothesis_id:
                exclude_extra.append(("hypothesis", pred.hypothesis_id))
            if pred.confidence is not None:
                source_annotation = f" [Уверенность автора в этом прогнозе: {pred.confidence}%]"

    candidates = await find_similar(db, user_id, text, entity_type, entity_id, top_k=8, exclude_extra=exclude_extra or None)
    if not candidates:
        return []

    # Аннотируем кандидатов-прогнозы их confidence тем же способом —
    # низкая заявленная уверенность у кандидата тоже сигнал "это мог быть
    # тест, а не убеждение", независимо от того, что сейчас проверяется.
    for c in candidates:
        if c["entity_type"] == "prediction":
            cand_pred = await db.get(Prediction, c["entity_id"])
            if cand_pred and cand_pred.confidence is not None:
                c["text"] = c["text"] + f" [Уверенность автора в этом прогнозе: {cand_pred.confidence}%]"

    return await find_contradictions(text + source_annotation, candidates)
