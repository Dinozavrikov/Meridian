"""Прогресс зрелости в лаборатории: полный вклад лаборатории (lab_total) и доступ участника без личных чисел."""
import pytest

from tests.conftest import create_test_user
from tests.test_lab_signal import _close, _login
from tests.test_lab_maturity import _contribution
from tests.test_lab_maturity_votes import _setup, _obs, _vote, OBSERVATION_WEIGHT


async def _progress(client, h):
    return await client.get(f"/api/v1/hypotheses/{h}/maturity-progress")


@pytest.mark.asyncio
async def test_lab_total_counts_owner_member_and_skips_private(client):
    owner, (b,), lab, h = await _setup(client, "lt1", 1)
    await _login(client, owner.username)
    c = await _contribution(await _close(client, h, lab, "подтвердился", 10))   # прогноз владельца в лабе
    o_own = await _obs(client, lab)
    await _vote(client, o_own, h, "подтверждает")                               # наблюдение владельца в лабе
    o_priv = await _obs(client, None)
    await _vote(client, o_priv, h, "подтверждает")                              # личное наблюдение: в лабу не идёт
    await _login(client, b.username)
    o_mem = await _obs(client, lab)
    await _vote(client, o_mem, h, "подтверждает")                               # наблюдение участника
    await _login(client, owner.username)
    j = (await _progress(client, h)).json()
    assert j["lab_total"] == pytest.approx(c + 2 * OBSERVATION_WEIGHT)
    assert j["pred_signal"] == pytest.approx(c)                                 # контроль: личные части на месте


@pytest.mark.asyncio
async def test_member_sees_lab_progress_without_personal_numbers(client):
    owner, (b,), lab, h = await _setup(client, "lt2", 1)
    await _login(client, b.username)
    c = await _contribution(await _close(client, h, lab, "подтвердился", 10))
    r = await _progress(client, h)
    assert r.status_code == 200, r.text                                         # сегодня 404
    j = r.json()
    assert j["lab_total"] == pytest.approx(c)
    assert j["next_threshold"] == pytest.approx(2.0) and j["next_level"] == 1
    for k in ("pred_signal", "obs_signal", "total_signal", "signal_level"):
        assert j[k] is None, k                                                  # личный сигнал владельца не отдаётся


@pytest.mark.asyncio
async def test_outsider_gets_404(client):
    owner, _, lab, h = await _setup(client, "lt3", 0)
    x = await create_test_user("lt3_x")
    await _login(client, x.username)
    assert (await _progress(client, h)).status_code == 404
