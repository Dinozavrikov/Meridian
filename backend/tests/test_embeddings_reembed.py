"""URL эмбеддингов и пересчёт сохранённых векторов при смене модели."""
import pytest
from sqlalchemy import select

from app.db.session import AsyncSessionLocal
from app.models.entities import EntityEmbedding
from app.services import embeddings
from app.services.ai import Embedded, embed_url_from_chat_url
from tests.conftest import create_test_user

OLD, NEW = [0.1] * 1024, [0.5] * 1024


def test_embed_url_is_derived_from_chat_url():
    assert embed_url_from_chat_url("http://host.docker.internal:11434/v1/chat/completions") \
        == "http://host.docker.internal:11434/api/embeddings"
    assert embed_url_from_chat_url("https://ollama.example:8443/v1/chat/completions") \
        == "https://ollama.example:8443/api/embeddings"


@pytest.fixture(autouse=True)
def _current_model(monkeypatch):
    monkeypatch.setenv("LLM_EMBEDDING_MODEL", "model-new")


def _row(user_id, etype, eid, text, model):
    return EntityEmbedding(user_id=user_id, entity_type=etype, entity_id=eid, text_snapshot=text,
                           embedding=OLD, embedding_model=model)


async def _rows():
    async with AsyncSessionLocal() as db:
        return {r.entity_id: r for r in (await db.execute(select(EntityEmbedding))).scalars().all()}


@pytest.mark.asyncio
async def test_reembed_updates_only_stale_rows_the_model_answered_for(monkeypatch):
    user = await create_test_user("emb_u1")
    async with AsyncSessionLocal() as db:
        db.add_all([
            _row(user.id, "observation", 1, "ok text", "model-old"),
            _row(user.id, "observation", 2, "broken", "model-old"),
            _row(user.id, "hypothesis", 3, "  ", "model-old"),
            _row(user.id, "prediction", 4, "fresh", "model-new"),
        ])
        await db.commit()

    async def fake(text):
        return None if text == "broken" else Embedded(NEW, "model-new")
    monkeypatch.setattr(embeddings, "embed", fake)

    async with AsyncSessionLocal() as db:
        result = await embeddings.reembed_all_entities(db, batch_size=2)
    assert result == {"total": 3, "updated": 1, "failed": 2}  # свежий вектор (уже model-new) не трогаем

    rows = await _rows()
    assert rows[1].embedding_model == "model-new" and list(rows[1].embedding) == pytest.approx(NEW)
    assert rows[2].embedding_model == "model-old" and list(rows[2].embedding) == pytest.approx(OLD)
    assert rows[3].embedding_model == "model-old" and list(rows[3].embedding) == pytest.approx(OLD)
    assert list(rows[4].embedding) == pytest.approx(OLD)


@pytest.mark.asyncio
async def test_reembed_all_flag_recomputes_fresh_rows_too(monkeypatch):
    user = await create_test_user("emb_u2")
    async with AsyncSessionLocal() as db:
        db.add_all([_row(user.id, "observation", 1, "a", "model-new"), _row(user.id, "observation", 2, "b", "model-old")])
        await db.commit()

    async def fake(text):
        return Embedded(NEW, "model-new")
    monkeypatch.setattr(embeddings, "embed", fake)

    async with AsyncSessionLocal() as db:
        assert await embeddings.reembed_all_entities(db, only_stale=False) == {"total": 2, "updated": 2, "failed": 0}
    rows = await _rows()
    assert all(r.embedding_model == "model-new" and list(r.embedding) == pytest.approx(NEW) for r in rows.values())
