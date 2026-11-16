"""Окончательное удаление наблюдения из корзины не должно возвращать/менять его вклад в предложение зрелости."""
import pytest

from tests.test_lab_signal import _close, _login
from tests.test_lab_maturity import _pending, _contribution
from tests.test_lab_maturity_votes import _setup, _obs, _vote, OBSERVATION_WEIGHT


@pytest.mark.asyncio
async def test_purged_observation_not_counted(client):
    _, (b,), lab, h = await _setup(client, "pg", 1)
    await _login(client, b.username)
    p = await _close(client, h, lab, "подтвердился", 10)
    c = await _contribution(p)
    o = await _obs(client, lab)
    await _vote(client, o, h, "подтверждает")
    assert (await _pending(h))[0].raw_signal == pytest.approx(c + OBSERVATION_WEIGHT)  # контроль
    assert (await client.delete(f"/api/v1/observations/{o}")).status_code == 204
    assert (await client.delete(f"/api/v1/observation/{o}/permanent")).status_code == 204
    sugs = await _pending(h)
    assert len(sugs) == 1 and sugs[0].raw_signal == pytest.approx(c)
