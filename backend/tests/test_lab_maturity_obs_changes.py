"""Предложение зрелости не должно устаревать, когда автор меняет важность наблюдения, удаляет или возвращает его."""
import pytest

from tests.test_lab_signal import _close, _login
from tests.test_lab_maturity import _pending, _contribution
from tests.test_lab_maturity_votes import _setup, _obs, _vote, OBSERVATION_WEIGHT


def _body(lab, importance):
    return {"date": "2026-08-06", "author": "а", "title": "Н", "text": "т", "status": "осмысленное",
            "visibility": "lab", "lab_id": lab, "importance": importance}


async def _raw(h):
    sugs = await _pending(h)
    assert len(sugs) == 1
    return sugs[0].raw_signal


async def _prepare(client, tag, by_owner):
    owner, (b,), lab, h = await _setup(client, tag, 1)
    await _login(client, (owner if by_owner else b).username)
    p = await _close(client, h, lab, "подтвердился", 10)
    c = await _contribution(p)
    assert c >= 2.0                                  # контроль: предложение существует
    o = await _obs(client, lab)
    await _vote(client, o, h, "подтверждает")
    assert await _raw(h) == pytest.approx(c + OBSERVATION_WEIGHT)   # контроль: наблюдение учтено
    return lab, h, o, c


@pytest.mark.asyncio
@pytest.mark.parametrize("by_owner", [False, True])
async def test_importance_change_updates_suggestion(client, by_owner):
    lab, h, o, c = await _prepare(client, f"ic{int(by_owner)}", by_owner)
    r = await client.put(f"/api/v1/observations/{o}", json=_body(lab, 0))
    assert r.status_code == 200, r.text
    assert await _raw(h) == pytest.approx(c)         # сегодня остаётся c + 0.3


@pytest.mark.asyncio
async def test_delete_and_restore_update_suggestion(client):
    lab, h, o, c = await _prepare(client, "dr", False)
    assert (await client.delete(f"/api/v1/observations/{o}")).status_code == 204
    assert await _raw(h) == pytest.approx(c)         # сегодня остаётся c + 0.3
    r = await client.post(f"/api/v1/observation/{o}/restore")
    assert r.status_code in (200, 204), r.text
    assert await _raw(h) == pytest.approx(c + OBSERVATION_WEIGHT)   # до патча осмысленно только после первого assert
