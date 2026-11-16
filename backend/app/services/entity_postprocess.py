"""
Единая фоновая пост-обработка после создания/редактирования Observation/Hypothesis/
Prediction/Worldview/Question.

Раньше upsert_entity_embedding + (только у Observation) classify_fact_or_interpretation
звались СИНХРОННО в теле create/update-роута — пользователь ждал 1-2 полных похода в
Ollama (таймауты до 30-60с каждый) на каждое сохранение записи. Обе операции best-effort
и не нужны немедленно клиенту: content_kind не входит в ObsOut и фронт его не читает,
используется только отложенной переоценкой (recheck_worker.py/contradiction_recheck.py).
Перенесены в фон 27.09, по тому же паттерну, что уже был у run_check_on_save_background
(собственная сессия — request-scoped db уже закрыта к моменту выполнения фоновой задачи).

Эмбеддинг считается ОДИН раз (запрос к Ollama не бесплатный) и переиспользуется для:
1) upsert_entity_embedding (запись вектора в entity_embeddings)
2) check_on_save (implicit-поиск ответов на открытые вопросы пользователя) — раньше эта
   функция всегда считала эмбеддинг ЗАНОВО для того же самого текста, второй одинаковый
   запрос в Ollama впустую.

classify_fact_or_interpretation (только Observation, см. её докстринг в ai.py) считается
ПАРАЛЛЕЛЬНО с эмбеддингом через asyncio.gather — независимые LLM-вызовы, нет причины
ждать их последовательно.

check_on_save намеренно НЕ запускается для entity_type="question" — сохраняет поведение
questions.py до этого патча (там run_check_on_save_background никогда не вызывался):
вопрос не должен искать ответ сам на себя среди открытых вопросов пользователя.
"""
import asyncio

from app.db.session import AsyncSessionLocal
from app.models.entities import Observation, QuestionAnswerFeedback
from app.services.ai import embed, classify_fact_or_interpretation
from app.services.embeddings import upsert_entity_embedding
from app.services.question_answers import check_on_save


async def run_entity_postprocessing_background(user_id: int, entity_type: str, entity_id: int, text: str) -> None:
    """Best-effort: любая ошибка (недоступность LLM/эмбеддингов, сбой БД) молча логируется
    и проглатывается — основной флоу сохранения сущности уже завершился и отдал ответ
    клиенту ДО запуска этой задачи (см. background_tasks.add_task в роутах)."""
    try:
        if entity_type == "observation":
            emb, content_kind = await asyncio.gather(
                embed(text),
                classify_fact_or_interpretation(text),
            )
        else:
            emb = await embed(text)
            content_kind = None

        async with AsyncSessionLocal() as db:
            await upsert_entity_embedding(db, user_id, entity_type, entity_id, text, precomputed=emb)

            if entity_type == "observation":
                obs = await db.get(Observation, entity_id)
                if obs is not None:
                    obs.content_kind = content_kind

            if entity_type != "question":
                vec = emb.vector if emb is not None else None
                results = await check_on_save(db, user_id, entity_type, entity_id, text, vec=vec)
                for item in results:
                    db.add(QuestionAnswerFeedback(
                        user_id=user_id,
                        question_id=item["question_id"],
                        source_entity_type=item["entity_type"],
                        source_entity_id=item["entity_id"],
                        matched_quote=item["quote"],
                        confidence=item["confidence"],
                        verdict="pending",
                    ))

            await db.commit()
    except Exception as e:
        print(f"[entity_postprocess] сбой фоновой обработки {entity_type}#{entity_id}: {type(e).__name__}: {e}", flush=True)
