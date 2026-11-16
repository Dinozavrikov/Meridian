"""ensure-content для заметок к наблюдениям (obs_post): права берутся у самого наблюдения, как в ленте.
Чужому приватного не отдаётся и в кэш не пишется; заголовок берётся из базы, а не из присланного."""
import pytest
from sqlalchemy import select

from app.db.session import AsyncSessionLocal
from app.models.social import ObservationPost
from tests.conftest import create_test_user
from tests.test_i18n_ensure_content_access import fake_translate, _login, _obs, _ask, _cache_rows  # noqa: F401

CONTENT = "Текст заметки из базы"


async def _note_id(client, obs_id):
    r = await client.post(f"/api/v1/feed/observation/{obs_id}/posts", json={"title": "Заголовок заметки", "content": CONTENT})
    assert r.status_code == 200, r.text
    async with AsyncSessionLocal() as db:
        q = select(ObservationPost.id).where(ObservationPost.observation_id == obs_id).order_by(ObservationPost.id.desc()).limit(1)
        return await db.scalar(q)


@pytest.mark.asyncio
async def test_note_of_public_observation_translates_title_from_db_not_the_sent_one(client):
    await create_test_user("op_a1"); await create_test_user("op_b1")
    await _login(client, "op_a1")
    nid = await _note_id(client, await _obs(client, "public"))
    await _login(client, "op_b1")
    assert await _ask(client, "obs_post", nid, "title", "ЛЕВЫЙ ТЕКСТ") == "EN:Заголовок заметки"


@pytest.mark.asyncio
async def test_note_preview_is_translated_as_derived_text(client):
    await create_test_user("op_a2"); await create_test_user("op_b2")
    await _login(client, "op_a2")
    nid = await _note_id(client, await _obs(client, "public"))
    await _login(client, "op_b2")
    assert await _ask(client, "obs_post", nid, "preview", CONTENT) == f"EN:{CONTENT}"


@pytest.mark.asyncio
async def test_note_of_private_observation_is_not_translated_for_a_stranger_and_cache_stays_empty(client):
    await create_test_user("op_a3"); await create_test_user("op_b3")
    await _login(client, "op_a3")
    nid = await _note_id(client, await _obs(client, "private"))
    await _login(client, "op_b3")
    assert await _ask(client, "obs_post", nid, "title") is None
    assert await _ask(client, "obs_post", nid, "preview", CONTENT) is None
    assert await _cache_rows() == 0


@pytest.mark.asyncio
async def test_note_of_trashed_observation_stops_translating(client):
    from sqlalchemy import func, update
    from app.models.entities import Observation
    await create_test_user("op_a4"); await create_test_user("op_b4")
    await _login(client, "op_a4")
    oid = await _obs(client, "public")
    nid = await _note_id(client, oid)
    await _login(client, "op_b4")
    assert await _ask(client, "obs_post", nid, "title") == "EN:Заголовок заметки", "предусловие: до корзины переводится"
    async with AsyncSessionLocal() as db:
        await db.execute(update(Observation).where(Observation.id == oid).values(deleted_at=func.now()))
        await db.commit()
    assert await _ask(client, "obs_post", nid, "title") is None
