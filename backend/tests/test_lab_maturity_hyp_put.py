"""Правка гипотезы через PUT (risk, maturity, lab_id) должна пересчитывать предложение зрелости."""
import pytest

from tests.test_lab_signal import _close, _login
from tests.test_lab_maturity import _pending, _contribution
from tests.test_lab_maturity_votes import _setup


def _put_body(lab, **over):
    body = {"name": "ЛГ", "description": "d", "date_created": "2026-08-06", "status": "идея",
            "risk": 0, "maturity": 0, "visibility": "lab", "lab_id": lab}
    body.update(over)
    return body


async def _put(client, h, body):
    r = await client.put(f"/api/v1/hypotheses/{h}", json=body)
    assert r.status_code == 200, r.text


@pytest.mark.asyncio
async def test_risk_change_drops_outdated_suggestion(client):
    owner, _, lab, h = await _setup(client, "hp1", 0)
    p = await _close(client, h, lab, "подтвердился", 10)
    assert (await _contribution(p)) >= 2.0
    assert len(await _pending(h)) == 1            # контроль: предложение есть при risk=0
    await _put(client, h, _put_body(lab, risk=10))  # порог уровня 1 стал 4.0 > 3.32
    assert await _pending(h) == []                # сегодня предложение остаётся


@pytest.mark.asyncio
async def test_manual_maturity_change_drops_suggestion(client):
    owner, _, lab, h = await _setup(client, "hp2", 0)
    await _close(client, h, lab, "подтвердился", 10)
    assert len(await _pending(h)) == 1            # контроль
    await _put(client, h, _put_body(lab, maturity=1))   # владелец сам поднял уровень
    assert await _pending(h) == []                # сегодня баннер «поднять до 1» остаётся


@pytest.mark.asyncio
async def test_leaving_lab_drops_member_based_suggestion(client):
    owner, (b,), lab, h = await _setup(client, "hp3", 1)
    await _login(client, b.username)
    await _close(client, h, lab, "подтвердился", 10)
    assert len(await _pending(h)) == 1            # контроль: предложение построено на вкладе участника
    await _login(client, owner.username)
    await _put(client, h, _put_body(None, visibility="private", lab_id=None))
    assert await _pending(h) == []                # сегодня остаётся
