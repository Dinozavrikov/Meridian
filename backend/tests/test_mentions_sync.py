"""Упоминания пересчитываются при любой ORM-записи rich-поля (слушатель after_flush): создание, правка, откат, rollback."""
import pytest
from sqlalchemy import select

from app.db.session import AsyncSessionLocal
from app.models.entities import EntityMention, Hypothesis, Observation, Question
from tests.test_undo import _edit_obs, _history, _login, _new_obs, _undo, _with_field
from tests.conftest import create_test_user


def _a(t, i):
    return f'<p><a href="meridian://{t}/{i}">x</a></p>'


async def _rows(db):
    return {(m.source_type, m.source_id, m.field, m.target_type, m.target_id)
            for m in (await db.execute(select(EntityMention))).scalars().all()}


def _obs(uid, slug, text):
    return Observation(user_id=uid, date="2026-09-28", author="t", title="t", slug=slug, text=text,
                       status="осмысленное", importance=0, visibility="private", lab_id=None)


@pytest.mark.asyncio
async def test_create_writes_mentions_with_new_id(test_user):
    async with AsyncSessionLocal() as db:
        o = _obs(test_user.id, "ms-1", _a("hypothesis", 5) + _a("task", 6))
        db.add(o); await db.commit(); await db.refresh(o)
        assert await _rows(db) == {("observation", o.id, "text", "hypothesis", 5), ("observation", o.id, "text", "task", 6)}


@pytest.mark.asyncio
async def test_update_recomputes_exactly(test_user):
    async with AsyncSessionLocal() as db:
        o = _obs(test_user.id, "ms-2", _a("hypothesis", 5) + _a("task", 6))
        db.add(o); await db.commit()
        o.text = _a("task", 6) + _a("question", 7); await db.commit()
        assert await _rows(db) == {("observation", o.id, "text", "task", 6), ("observation", o.id, "text", "question", 7)}
        o.text = "<p>без ссылок</p>"; await db.commit()
        assert await _rows(db) == set()


@pytest.mark.asyncio
async def test_unrelated_field_change_does_not_touch_mentions(test_user):
    async with AsyncSessionLocal() as db:
        o = _obs(test_user.id, "ms-3", _a("hypothesis", 5))
        db.add(o); await db.commit()
        db.add(EntityMention(source_type="observation", source_id=o.id, field="text", target_type="task", target_id=99))  # метка
        await db.commit()
        o.title = "другой заголовок"; await db.commit()
        assert ("observation", o.id, "text", "task", 99) in await _rows(db)


@pytest.mark.asyncio
async def test_fields_are_independent_and_plain_fields_are_ignored(test_user):
    async with AsyncSessionLocal() as db:
        q = Question(user_id=test_user.id, title="q", slug="ms-q", date_created="2026-09-28", text=_a("task", 1), answer=_a("task", 2))
        h = Hypothesis(user_id=test_user.id, name="h", slug="ms-h", date_created="2026-09-28",
                       description=_a("task", 3), falsification_criteria=_a("task", 4))
        db.add_all([q, h]); await db.commit()
        assert await _rows(db) == {("question", q.id, "text", "task", 1), ("question", q.id, "answer", "task", 2),
                                   ("hypothesis", h.id, "description", "task", 3)}   # falsification_criteria: plain
        q.answer = ""; await db.commit()
        assert await _rows(db) == {("question", q.id, "text", "task", 1), ("hypothesis", h.id, "description", "task", 3)}


@pytest.mark.asyncio
async def test_rollback_leaves_no_mentions(test_user):
    async with AsyncSessionLocal() as db:
        db.add(_obs(test_user.id, "ms-5", _a("hypothesis", 5)))
        await db.flush()
        assert len(await _rows(db)) == 1
        await db.rollback()
    async with AsyncSessionLocal() as db:
        assert await _rows(db) == set()


@pytest.mark.asyncio
async def test_api_put_and_undo_keep_mentions_in_sync(client):
    await create_test_user("ms_api")
    await _login(client, "ms_api")
    obs = await _new_obs(client)
    await _edit_obs(client, obs["id"], text=_a("hypothesis", 5))
    async with AsyncSessionLocal() as db:
        assert await _rows(db) == {("observation", obs["id"], "text", "hypothesis", 5)}
    ev = _with_field(await _history(client, "observation", obs["id"]), "text")[0]
    r = await _undo(client, "observation", obs["id"], ev["id"])
    assert r.status_code < 300, r.text
    async with AsyncSessionLocal() as db:
        assert await _rows(db) == set()   # откат текста снял и упоминание


def test_sync_covers_every_rich_class_except_pending_suggestion():
    from app.core.text_fields import RICH_TEXT_FIELDS
    from app.services.mention_sync import FIELDS
    assert set(RICH_TEXT_FIELDS) - {c.__name__ for c in FIELDS} == {"ResultEditSuggestion"}
