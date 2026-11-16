"""Сигнал наблюдений по гипотезе (hypothesis_evidence.observation_signal): знак по типу связи,
вес = важность/5 * OBSERVATION_WEIGHT, нейтральные связи и удалённые наблюдения не считаются.
Тесты на реальных данных в БД; фиксируют поведение до и после выноса чистой части."""
from datetime import datetime, timezone

import pytest

from app.db.session import AsyncSessionLocal
from app.models.entities import Hypothesis, Observation, Link
from app.services.hypothesis_evidence import observation_signal, OBSERVATION_WEIGHT
from tests.conftest import create_test_user



async def _setup(uname, obs_specs, link_dir="obs->hyp"):
    """obs_specs: [(importance, link_type, deleted)] -> (user_id, hyp_id)."""
    u = await create_test_user(uname)
    async with AsyncSessionLocal() as db:
        h = Hypothesis(user_id=u.id, name="H", slug=f"h-{uname}", date_created="2026-01-01")
        db.add(h)
        await db.flush()
        for i, (imp, ltype, deleted) in enumerate(obs_specs):
            o = Observation(user_id=u.id, date="2026-01-02", author="t", title=f"O{i}",
                            slug=f"o-{uname}-{i}", text="x", importance=imp,
                            deleted_at=datetime.now(timezone.utc) if deleted else None)
            db.add(o)
            await db.flush()
            a, b = (("observation", o.id), ("hypothesis", h.id)) if link_dir == "obs->hyp" \
                else (("hypothesis", h.id), ("observation", o.id))
            db.add(Link(user_id=u.id, from_type=a[0], from_id=a[1], to_type=b[0], to_id=b[1], link_type=ltype))
        await db.commit()
        return u.id, h.id


async def _signal(uid, hid):
    async with AsyncSessionLocal() as db:
        return await observation_signal(db, uid, hid)


@pytest.mark.asyncio
async def test_no_links_is_zero():
    uid, hid = await _setup("sig_none", [])
    assert await _signal(uid, hid) == 0.0


@pytest.mark.asyncio
async def test_confirm_adds_importance_over_5_times_weight():
    uid, hid = await _setup("sig_conf", [(5, "подтверждает", False)])
    assert await _signal(uid, hid) == pytest.approx(1.0 * OBSERVATION_WEIGHT)


@pytest.mark.asyncio
async def test_refute_subtracts_symmetrically():
    uid, hid = await _setup("sig_ref", [(5, "опровергает", False)])
    assert await _signal(uid, hid) == pytest.approx(-1.0 * OBSERVATION_WEIGHT)


@pytest.mark.asyncio
async def test_importance_scales_and_sums():
    uid, hid = await _setup("sig_sum", [(5, "подтверждает", False), (3, "подтверждает", False), (2, "опровергает", False)])
    assert await _signal(uid, hid) == pytest.approx((1.0 + 0.6 - 0.4) * OBSERVATION_WEIGHT)


@pytest.mark.asyncio
async def test_neutral_link_does_not_count():
    uid, hid = await _setup("sig_neu", [(5, "связано", False)])
    assert await _signal(uid, hid) == 0.0


@pytest.mark.asyncio
async def test_zero_importance_contributes_nothing():
    uid, hid = await _setup("sig_zero", [(0, "подтверждает", False)])
    assert await _signal(uid, hid) == 0.0


@pytest.mark.asyncio
async def test_link_direction_hyp_to_obs_counts_too():
    uid, hid = await _setup("sig_rev", [(5, "подтверждает", False)], link_dir="hyp->obs")
    assert await _signal(uid, hid) == pytest.approx(1.0 * OBSERVATION_WEIGHT)


@pytest.mark.asyncio
async def test_deleted_observation_is_ignored():
    uid, hid = await _setup("sig_del", [(5, "подтверждает", True), (5, "подтверждает", False)])
    assert await _signal(uid, hid) == pytest.approx(1.0 * OBSERVATION_WEIGHT)


# --- чистые части (без БД) ---
from types import SimpleNamespace as _NS
from app.services.hypothesis_evidence import link_signs, signal_from_evidence


def _lnk(ltype, obs_id, obs_first=True):
    a, b = ("observation", obs_id), ("hypothesis", 1)
    if not obs_first:
        a, b = b, a
    return _NS(from_type=a[0], from_id=a[1], to_type=b[0], to_id=b[1], link_type=ltype)


def test_link_signs_by_type_and_direction():
    assert link_signs([_lnk("подтверждает", 1), _lnk("опровергает", 2, obs_first=False), _lnk("связано", 3)]) == {1: 1, 2: -1}


def test_link_signs_last_link_wins():
    assert link_signs([_lnk("подтверждает", 1), _lnk("опровергает", 1)]) == {1: -1}


def test_signal_from_evidence_matches_formula_and_exclude():
    ev = [(1, 1, 5), (2, 1, 3), (3, -1, 2)]
    assert signal_from_evidence(ev) == pytest.approx((1.0 + 0.6 - 0.4) * OBSERVATION_WEIGHT)
    assert signal_from_evidence(ev, exclude={1}) == pytest.approx((0.6 - 0.4) * OBSERVATION_WEIGHT)
    assert signal_from_evidence(ev, exclude={1, 2, 3}) == 0.0


@pytest.mark.asyncio
async def test_bulk_matches_single_and_ignores_foreign_links():
    from app.services.hypothesis_evidence import observation_evidence, observation_evidence_bulk
    u1, h1 = await _setup("blk_a", [(5, "подтверждает", False), (3, "опровергает", False), (2, "связано", False)])
    u2, h2 = await _setup("blk_b", [(4, "подтверждает", False), (1, "подтверждает", True)], link_dir="hyp->obs")
    # чужая связь к гипотезе h1: в расчёт владельца не входит ни в одном из вариантов
    stranger = await create_test_user("blk_stranger")
    async with AsyncSessionLocal() as db:
        o = Observation(user_id=stranger.id, date="2026-01-02", author="t", title="X", slug="blk-x", text="x", importance=5)
        db.add(o); await db.flush()
        db.add(Link(user_id=stranger.id, from_type="observation", from_id=o.id, to_type="hypothesis",
                    to_id=h1, link_type="подтверждает"))
        await db.commit()
        hyps = [await db.get(Hypothesis, h1), await db.get(Hypothesis, h2)]
        bulk = await observation_evidence_bulk(db, hyps)
        for h, uid in ((h1, u1), (h2, u2)):
            assert sorted(bulk[h]) == sorted(await observation_evidence(db, uid, h))
    assert len(bulk[h1]) == 2 and len(bulk[h2]) == 1


@pytest.mark.asyncio
async def test_bulk_empty_input():
    from app.services.hypothesis_evidence import observation_evidence_bulk
    async with AsyncSessionLocal() as db:
        assert await observation_evidence_bulk(db, []) == {}
