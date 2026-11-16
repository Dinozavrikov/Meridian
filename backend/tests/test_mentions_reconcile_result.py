"""Сверка entity_mentions для Result как источника. ОХРАННЫЕ (зелёные и до патча): поведение уже реализовано.
Дрейф считается дельтой к базе: сверка сканирует всю таблицу, чужие строки не должны влиять."""
import pytest
from sqlalchemy import delete

from app.db.session import AsyncSessionLocal
from app.models.entities import EntityMention
from app.services.mention_reconcile import reconcile_mentions
from tests.test_mentions_related_matrix import _obs_text, _a
from tests.test_mentions_result import _mk_result, _rows
from tests.test_open_via_link import _world

ZERO = {"add": 0, "stale": 0, "orphan_source": 0, "orphan_target": 0}


async def _rec(apply=False):
    async with AsyncSessionLocal() as db:
        c = await reconcile_mentions(db, apply=apply)
        if apply:
            await db.commit()
    return c


def _delta(after, before):
    return {k: after[k] - before[k] for k in after}


@pytest.mark.asyncio
async def test_no_drift_for_result_source(client):
    a, b, c, lab, r, n = await _world(client)
    target = await _obs_text(client, "Цель", "x", vis="public")
    base = await _rec()
    rid = await _mk_result(client, lab, _a(target))
    assert await _rows(rid) == {("body", "observation", target)}        # контроль: строка записана слушателем
    assert _delta(await _rec(), base) == ZERO


@pytest.mark.asyncio
async def test_missing_row_is_found_dry_run_writes_nothing_apply_restores(client):
    a, b, c, lab, r, n = await _world(client)
    target = await _obs_text(client, "Цель", "x", vis="public")
    base = await _rec()
    rid = await _mk_result(client, lab, _a(target))
    async with AsyncSessionLocal() as db:
        await db.execute(delete(EntityMention).where(EntityMention.source_type == "result", EntityMention.source_id == rid))
        await db.commit()
    assert await _rows(rid) == set()                                    # контроль: строки нет
    assert _delta(await _rec(), base) == {**ZERO, "add": 1}
    assert await _rows(rid) == set()                                    # dry-run ничего не записал
    await _rec(apply=True)
    assert await _rows(rid) == {("body", "observation", target)}
    assert _delta(await _rec(), base) == ZERO                           # идемпотентна


@pytest.mark.asyncio
async def test_deleted_result_leaves_no_rows_after_apply(client):
    """Фиксирует конечное состояние. Остаётся ли строка ДО сверки, тест не утверждает: слушатель я не читал."""
    a, b, c, lab, r, n = await _world(client)
    target = await _obs_text(client, "Цель", "x", vis="public")
    base = await _rec()
    rid = await _mk_result(client, lab, _a(target))
    assert await _rows(rid)                                             # контроль
    d = await client.delete(f"/api/v1/results/{rid}")
    assert d.status_code == 204, d.text
    await _rec(apply=True)
    assert await _rows(rid) == set()
    assert _delta(await _rec(), base) == ZERO
