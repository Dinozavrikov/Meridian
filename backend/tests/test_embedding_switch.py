"""Смена модели эмбеддингов: старые векторы не участвуют в поиске (нет мусора), пока их не пересчитали."""
import pytest
from sqlalchemy import select
from sqlalchemy.dialects import postgresql

from app.db.session import AsyncSessionLocal
from app.models.entities import EntityEmbedding
from app.services import embeddings, evidence_diversity
from app.services.ai import Embedded
from tests.conftest import create_test_user

VEC = [0.5] * 1024


def _fake_embed(model):
    async def fake(text):
        return Embedded(VEC, model)
    return fake


@pytest.fixture(autouse=True)
def _reset_warnings(monkeypatch):
    monkeypatch.setattr(embeddings, "_STALE_WARNED", set())


def _row(user_id, etype, eid, model):
    return EntityEmbedding(user_id=user_id, entity_type=etype, entity_id=eid, text_snapshot="текст",
                           embedding=VEC, embedding_model=model)


@pytest.mark.asyncio
async def test_upsert_marks_the_model(monkeypatch):
    monkeypatch.setenv("LLM_EMBEDDING_MODEL", "m1")
    monkeypatch.setattr(embeddings, "embed", _fake_embed("m1"))
    user = await create_test_user("sw_u1")
    async with AsyncSessionLocal() as db:
        await embeddings.upsert_entity_embedding(db, user.id, "observation", 1, "Запись про сон и кофе")
        await db.commit()
    async with AsyncSessionLocal() as db:
        row = (await db.execute(select(EntityEmbedding))).scalar_one()
    assert row.embedding_model == "m1"


@pytest.mark.asyncio
async def test_model_switch_hides_stale_vectors_until_reembedded(monkeypatch, capsys):
    user = await create_test_user("sw_u2")
    monkeypatch.setenv("LLM_EMBEDDING_MODEL", "m1")
    monkeypatch.setattr(embeddings, "embed", _fake_embed("m1"))

    async def query_vec(text):
        return VEC
    monkeypatch.setattr(embeddings, "get_embedding", query_vec)

    async with AsyncSessionLocal() as db:
        await embeddings.upsert_entity_embedding(db, user.id, "observation", 1, "Запись про сон и кофе")
        await db.commit()

    async def search():
        async with AsyncSessionLocal() as db:
            return await embeddings.find_similar(db, user.id, "запрос", "observation", 99)

    assert [c["entity_id"] for c in await search()] == [1]

    monkeypatch.setenv("LLM_EMBEDDING_MODEL", "m2")
    monkeypatch.setattr(embeddings, "embed", _fake_embed("m2"))
    assert await search() == []  # вектор модели m1 не участвует в поиске модели m2
    assert "другой моделью" in capsys.readouterr().out
    async with AsyncSessionLocal() as db:
        assert await embeddings.stale_embedding_count(db) == 1

    async with AsyncSessionLocal() as db:
        assert await embeddings.reembed_all_entities(db) == {"total": 1, "updated": 1, "failed": 0}
    assert [c["entity_id"] for c in await search()] == [1]
    async with AsyncSessionLocal() as db:
        assert await embeddings.stale_embedding_count(db) == 0


@pytest.mark.asyncio
async def test_vectors_for_and_evidence_diversity_use_only_the_current_model(monkeypatch):
    user = await create_test_user("sw_u3")
    monkeypatch.setenv("LLM_EMBEDDING_MODEL", "m1")
    async with AsyncSessionLocal() as db:
        db.add_all([_row(user.id, "source_document", 1, "m1"), _row(user.id, "source_document", 2, "m2")])
        await db.commit()
    async with AsyncSessionLocal() as db:
        assert list(await embeddings.vectors_for(db, "source_document", [1, 2])) == [1]
        assert list(await evidence_diversity._source_embeddings(db, [1, 2])) == [1]


@pytest.mark.asyncio
async def test_candidates_exclude_questions_and_other_models(monkeypatch):
    user = await create_test_user("sw_u4")
    monkeypatch.setenv("LLM_EMBEDDING_MODEL", "m1")
    async with AsyncSessionLocal() as db:
        db.add_all([
            _row(user.id, "observation", 1, "m1"),
            _row(user.id, "question", 2, "m1"),
            _row(user.id, "hypothesis", 3, "m2"),
        ])
        await db.commit()
    async with AsyncSessionLocal() as db:
        rows = await embeddings.similar_candidates(db, user.id, VEC, exclude_types=("question",), limit=10)
    assert [(r.entity_type, r.entity_id) for r in rows] == [("observation", 1)]


def test_open_questions_query_filters_model_and_status(monkeypatch):
    monkeypatch.setenv("LLM_EMBEDDING_MODEL", "m1")
    sql = str(embeddings.open_questions_query(1, VEC).compile(dialect=postgresql.dialect()))
    assert "entity_embeddings.embedding_model" in sql
    assert "questions.status" in sql
    assert "questions.id = entity_embeddings.entity_id" in sql
