"""Сверка упоминаний (бэкфилл): таблица приводится к тексту. Идемпотентна, dry-run ничего не пишет."""
import pytest
from sqlalchemy import delete, insert, select

from app.db.session import AsyncSessionLocal
from app.models.entities import EntityMention, Hypothesis, Observation
from app.services.mention_reconcile import reconcile_mentions

_T = EntityMention.__table__
ZERO = {"add": 0, "stale": 0, "orphan_source": 0, "orphan_target": 0}


def _a(t, i):
    return f'<p><a href="meridian://{t}/{i}">x</a></p>'


async def _rows(db):
    return {(m.source_type, m.source_id, m.field, m.target_type, m.target_id)
            for m in (await db.execute(select(EntityMention))).scalars().all()}


async def _mk(db, uid, text, slug):
    h = Hypothesis(user_id=uid, name="h", slug=slug + "-h", date_created="2026-09-28")
    db.add(h); await db.commit(); await db.refresh(h)
    o = Observation(user_id=uid, date="2026-09-28", author="t", title="t", slug=slug, text=text.format(h=h.id),
                    status="осмысленное", importance=0, visibility="private", lab_id=None)
    db.add(o); await db.commit(); await db.refresh(o)
    return o, h


@pytest.mark.asyncio
async def test_missing_rows_added_dry_run_writes_nothing_and_second_run_is_noop(test_user):
    async with AsyncSessionLocal() as db:
        o, h = await _mk(db, test_user.id, '<a href="meridian://hypothesis/{h}">x</a>', "rc-1")
        await db.execute(delete(_T)); await db.commit()
        assert await reconcile_mentions(db, apply=False) == {**ZERO, "add": 1}
        assert await _rows(db) == set()
        assert await reconcile_mentions(db, apply=True) == {**ZERO, "add": 1}
        await db.commit()
        assert await _rows(db) == {("observation", o.id, "text", "hypothesis", h.id)}
        assert await reconcile_mentions(db, apply=True) == ZERO


@pytest.mark.asyncio
async def test_stale_row_of_living_source_is_removed(test_user):
    async with AsyncSessionLocal() as db:
        o, h = await _mk(db, test_user.id, "<p>без ссылок</p>", "rc-2")
        await db.execute(insert(_T).values(source_type="observation", source_id=o.id, field="text", target_type="hypothesis", target_id=h.id))
        await db.commit()
        assert await reconcile_mentions(db, apply=True) == {**ZERO, "stale": 1}
        await db.commit()
        assert await _rows(db) == set()


@pytest.mark.asyncio
async def test_orphan_source_removed(test_user):
    async with AsyncSessionLocal() as db:
        await db.execute(insert(_T).values(source_type="observation", source_id=999_999, field="text", target_type="hypothesis", target_id=1))
        await db.commit()
        assert await reconcile_mentions(db, apply=True) == {**ZERO, "orphan_source": 1}
        await db.commit()
        assert await _rows(db) == set()


@pytest.mark.asyncio
async def test_orphan_target_removed_even_though_text_has_the_link(test_user):
    async with AsyncSessionLocal() as db:
        o, _h = await _mk(db, test_user.id, '<a href="meridian://hypothesis/424242">x</a>', "rc-4")
        assert ("observation", o.id, "text", "hypothesis", 424242) in await _rows(db)   # слушатель цель не проверяет
        assert await reconcile_mentions(db, apply=True) == {**ZERO, "orphan_target": 1}
        await db.commit()
        assert await _rows(db) == set()
        assert await reconcile_mentions(db, apply=True) == ZERO


@pytest.mark.asyncio
async def test_task_target_is_not_orphan_and_trashed_source_keeps_mentions(test_user):
    from datetime import datetime, timezone
    from app.models.entities import ResearchTask
    async with AsyncSessionLocal() as db:
        t = ResearchTask(user_id=test_user.id, name="t", slug="rc-5-t")
        db.add(t); await db.commit(); await db.refresh(t)
        o, _h = await _mk(db, test_user.id, f'<a href="meridian://task/{t.id}">x</a>', "rc-5")
        o.deleted_at = datetime.now(timezone.utc); await db.commit()
        assert await reconcile_mentions(db, apply=True) == ZERO
        assert await _rows(db) == {("observation", o.id, "text", "task", t.id)}
