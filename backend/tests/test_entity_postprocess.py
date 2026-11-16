"""Юнит-тесты на services/entity_postprocess.py — дедупликация эмбеддинга (баг от 27.09:
check_on_save раньше пересчитывал эмбеддинг ЗАНОВО для того же текста, второй бесполезный
поход в Ollama даже в фоне). Мокаем ai.embed/classify_fact_or_interpretation здесь
НАМЕРЕННО (в отличие от остального проекта, см. conftest.py) — это чисто counting-тест
на количество вызовов, не на корректность самого AI-ответа.

Каждая проверка открывает и закрывает СВОЮ AsyncSessionLocal() (см. conftest.py::create_test_user
и обсуждение 19.09) — НЕ шарит долгоживущую db_session-фикстуру с кодом, который сам открывает
сессии (run_entity_postprocessing_background, upsert_entity_embedding): смешение этих двух
паттернов в одном тесте — источник 'another operation is in progress' / 'attached to a
different loop', уже пойманного и задокументированного на этом проекте."""
import pytest
from unittest.mock import AsyncMock, patch

from app.services.ai import Embedded
from app.services.entity_postprocess import run_entity_postprocessing_background
from app.models.entities import Observation, Question
from app.db.session import AsyncSessionLocal
from tests.conftest import create_test_user


async def _create_observation(user_id: int, text: str, title: str = "Тест") -> int:
    async with AsyncSessionLocal() as db:
        obs = Observation(
            user_id=user_id, date="2026-09-27", author="Test", title=title, text=text,
            status="осмысленное", visibility="private",
        )
        db.add(obs)
        await db.commit()
        await db.refresh(obs)
        return obs.id


async def _create_question(user_id: int, text: str) -> int:
    async with AsyncSessionLocal() as db:
        q = Question(user_id=user_id, title="Тестовый вопрос", text=text, status="открыт",
                     date_created="2026-09-27", visibility="private")
        db.add(q)
        await db.commit()
        await db.refresh(q)
        return q.id


@pytest.mark.asyncio
async def test_observation_postprocessing_calls_embed_exactly_once():
    user = await create_test_user("postprocess_obs_user")
    obs_id = await _create_observation(user.id, "Наблюдение для теста")

    fake_emb = Embedded([0.1] * 1024, "qwen3-embedding:0.6b")

    with patch("app.services.entity_postprocess.embed", new=AsyncMock(return_value=fake_emb)) as mock_embed, \
         patch("app.services.entity_postprocess.classify_fact_or_interpretation", new=AsyncMock(return_value="fact")) as mock_classify, \
         patch("app.services.entity_postprocess.check_on_save", new=AsyncMock(return_value=[])) as mock_check:
        await run_entity_postprocessing_background(user.id, "observation", obs_id, "Наблюдение для теста")

    assert mock_embed.await_count == 1, "embed() должен зваться РОВНО один раз (не дублироваться в check_on_save)"
    assert mock_classify.await_count == 1

    passed_vec = mock_check.call_args.kwargs.get("vec")
    assert passed_vec == fake_emb.vector, "check_on_save должен получить уже посчитанный вектор, не пересчитывать сам"

    async with AsyncSessionLocal() as db:
        obs = await db.get(Observation, obs_id)
        assert obs.content_kind == "fact"


@pytest.mark.asyncio
async def test_question_postprocessing_does_not_run_check_on_save():
    """Question намеренно не ищет ответ сам на себя (см. докстринг entity_postprocess.py) —
    поведение questions.py до этого патча, которое не должно было измениться."""
    user = await create_test_user("postprocess_q_user")
    q_id = await _create_question(user.id, "?")

    fake_emb = Embedded([0.2] * 1024, "qwen3-embedding:0.6b")
    with patch("app.services.entity_postprocess.embed", new=AsyncMock(return_value=fake_emb)), \
         patch("app.services.entity_postprocess.check_on_save", new=AsyncMock(return_value=[])) as mock_check:
        await run_entity_postprocessing_background(user.id, "question", q_id, "?")

    mock_check.assert_not_awaited()


@pytest.mark.asyncio
async def test_upsert_entity_embedding_skips_embed_when_precomputed():
    from app.services.embeddings import upsert_entity_embedding
    fake_emb = Embedded([0.3] * 1024, "qwen3-embedding:0.6b")
    with patch("app.services.embeddings.embed", new=AsyncMock()) as mock_embed:
        async with AsyncSessionLocal() as db:
            result = await upsert_entity_embedding(db, 999999, "observation", 999999, "любой текст", precomputed=fake_emb)
    mock_embed.assert_not_awaited()
    assert result is fake_emb


@pytest.mark.asyncio
async def test_check_on_save_skips_get_embedding_when_vec_given():
    from app.services.question_answers import check_on_save
    with patch("app.services.question_answers.get_embedding", new=AsyncMock()) as mock_get_emb, \
         patch("app.services.question_answers.similar_open_questions", new=AsyncMock(return_value=[])):
        async with AsyncSessionLocal() as db:
            await check_on_save(db, 999999, "observation", 999999, "любой текст", vec=[0.1] * 1024)
    mock_get_emb.assert_not_awaited()
