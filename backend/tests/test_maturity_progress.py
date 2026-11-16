"""Прогресс до следующего уровня зрелости: части сигнала и порог числами (тот же maturity_signal, что у предложения)."""
import pytest
from sqlalchemy import update

from tests.test_lab_signal import _close, _login
from tests.test_lab_maturity import _hyp, _contribution
from tests.test_lab_maturity_votes import _setup
from app.db.session import AsyncSessionLocal
from app.models.entities import Hypothesis


async def _progress(client, h):
    return await client.get(f"/api/v1/hypotheses/{h}/maturity-progress")


@pytest.mark.asyncio
async def test_progress_shows_parts_and_threshold_risk0(client):
    owner, (b,), lab, h = await _setup(client, "mpr1", 1)
    await _login(client, b.username)
    c = await _contribution(await _close(client, h, lab, "подтвердился", 10))
    await _login(client, owner.username)
    r = await _progress(client, h)
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["pred_signal"] == 0.0 and j["obs_signal"] == 0.0
    assert j["lab_signal"] == pytest.approx(c) and j["total_signal"] == pytest.approx(c)
    assert j["maturity"] == 0 and j["next_level"] == 1
    assert j["next_threshold"] == pytest.approx(2.0)      # risk=0: 2.0 * 1.0
    assert j["signal_level"] == 1                          # 3.32 >= 2.0


@pytest.mark.asyncio
async def test_progress_threshold_scales_with_risk(client):
    owner, (b,), lab, _ = await _setup(client, "mpr2", 1)
    h = await _hyp(client, lab, risk=5)
    await _login(client, b.username)
    c = await _contribution(await _close(client, h, lab, "подтвердился", 85))
    await _login(client, owner.username)
    j = (await _progress(client, h)).json()
    assert j["next_threshold"] == pytest.approx(3.0)      # risk=5: 2.0 * 1.5
    assert j["total_signal"] == pytest.approx(c) and j["signal_level"] == 0


@pytest.mark.asyncio
async def test_progress_at_top_level_has_no_next(client):
    owner, _, lab, h = await _setup(client, "mpr3", 0)
    async with AsyncSessionLocal() as db:
        await db.execute(update(Hypothesis).where(Hypothesis.id == h).values(maturity=4))
        await db.commit()
    j = (await _progress(client, h)).json()
    assert j["next_level"] is None and j["next_threshold"] is None


@pytest.mark.asyncio
async def test_progress_is_owner_only(client):
    """Посторонний (не владелец и не участник лаборатории) прогресс не видит. Участнику лаборатории доступна только
    лабораторная часть без личных чисел: см. test_maturity_progress_lab.py."""
    from tests.conftest import create_test_user
    owner, _, lab, h = await _setup(client, "mpr4", 0)
    x = await create_test_user("mpr4_x")
    await _login(client, x.username)
    assert (await _progress(client, h)).status_code == 404
