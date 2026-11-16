"""Участник вышел из лаборатории: его голоса по наблюдениям больше не считаются, предложение владельца пересчитано.
Вклады прогнозов заморожены и от выхода не меняются."""
import pytest

from tests.test_lab_signal import _close, _login
from tests.test_lab_maturity import _pending, _contribution
from tests.test_lab_maturity_votes import _setup, _obs, _vote, OBSERVATION_WEIGHT


@pytest.mark.asyncio
async def test_leaving_member_votes_stop_counting_and_suggestion_updates(client):
    owner, (b,), lab, h = await _setup(client, "lv", 1)
    await _login(client, b.username)
    c = await _contribution(await _close(client, h, lab, "подтвердился", 10))
    o = await _obs(client, lab)
    await _vote(client, o, h, "подтверждает")
    sugs = await _pending(h)
    assert len(sugs) == 1 and sugs[0].raw_signal == pytest.approx(c + OBSERVATION_WEIGHT)   # контроль
    r = await client.delete(f"/api/v1/labs/{lab}/leave")
    assert r.status_code == 200, r.text
    sugs = await _pending(h)
    assert len(sugs) == 1
    assert sugs[0].raw_signal == pytest.approx(c)      # сегодня остаётся c + 0.3: пересчёта при выходе нет
    assert sugs[0].lab_signal == pytest.approx(c)      # замороженный вклад прогноза остался, голос ушёл
