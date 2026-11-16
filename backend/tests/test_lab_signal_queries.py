"""GET /labs/{id}/signal: рост числа SQL-запросов с числом гипотез (общая память на запрос).
Меряем НАКЛОН = (запросов при 5 гипотезах - при 1) / 4: постоянные запросы лаборатории (пользователь, членство,
список гипотез, состав лаборатории) в наклон не входят. Счётчик запросов свой (через before_cursor_execute)."""
import contextlib

import pytest
from sqlalchemy import event

from app.db.session import engine
from tests.test_lab_signal import _close, _login
from tests.test_lab_maturity import _hyp
from tests.test_lab_maturity_votes import _setup, _obs, _vote

PER_HYP_PLAIN = 7       # два закрытых прогноза, наблюдений нет, смотрит владелец гипотез
PER_HYP_WITH_OBS = 11   # то же + наблюдение владельца в лабе + голос участника по другому наблюдению


@contextlib.contextmanager
def _count():
    box = {"n": 0}
    eng = getattr(engine, "sync_engine", engine)

    def cb(*_a, **_k):
        box["n"] += 1
    event.listen(eng, "before_cursor_execute", cb)
    try:
        yield box
    finally:
        event.remove(eng, "before_cursor_execute", cb)


async def _fill(client, owner, member, lab, h, with_obs):
    await _login(client, owner.username)
    await _close(client, h, lab, "подтвердился", 10)
    await _close(client, h, lab, "не подтвердился", 80)
    if with_obs:
        o1 = await _obs(client, lab)
        await _vote(client, o1, h, "подтверждает")      # наблюдение владельца в лабе (его «свой» сигнал)
        await _login(client, member.username)
        o2 = await _obs(client, lab)
        await _vote(client, o2, h, "подтверждает")      # голос участника (чужой вклад)
        await _login(client, owner.username)


async def _queries(client, lab, expected_hyps):
    with _count() as box:
        r = await client.get(f"/api/v1/labs/{lab}/signal")
    assert r.status_code == 200, r.text
    assert box["n"] > 0, "счётчик не видит запросы: клиент ходит через другой движок"
    assert len(r.json()["hypotheses"]) == expected_hyps
    return box["n"]


async def _slope(client, tag, with_obs):
    owner, (b,), lab, h1 = await _setup(client, tag, 1)
    await _fill(client, owner, b, lab, h1, with_obs)
    q1 = await _queries(client, lab, 1)
    for _ in range(4):
        h = await _hyp(client, lab)
        await _fill(client, owner, b, lab, h, with_obs)
    q5 = await _queries(client, lab, 5)
    return (q5 - q1) / 4, q1, q5


@pytest.mark.asyncio
async def test_signal_queries_per_hypothesis_plain(client):
    slope, q1, q5 = await _slope(client, "sq1", False)
    assert slope <= PER_HYP_PLAIN, f"{slope} запросов на гипотезу (1 гип.: {q1}, 5 гип.: {q5}), ждём не больше {PER_HYP_PLAIN}"


@pytest.mark.asyncio
async def test_signal_queries_per_hypothesis_with_observations(client):
    slope, q1, q5 = await _slope(client, "sq2", True)
    assert slope <= PER_HYP_WITH_OBS, f"{slope} запросов на гипотезу (1 гип.: {q1}, 5 гип.: {q5}), ждём не больше {PER_HYP_WITH_OBS}"
