"""Этап 2 лабораторий: предложение зрелости считается от «свой сигнал + ЧУЖОЙ вклад в лаборатории».
Вклад владельца повторно не считается (он уже в evidence_signal)."""
import pytest
from sqlalchemy import select

from tests.conftest import add_lab_member, create_test_user
from tests.test_lab_signal import _close, _lab, _login
from app.db.session import AsyncSessionLocal
from app.models.entities import Hypothesis, MaturitySuggestion, Prediction


async def _hyp(client, lab_id, risk=0):
    r = await client.post("/api/v1/hypotheses/", json={
        "name": "ЛГ", "description": "d", "date_created": "2026-08-06", "status": "идея",
        "visibility": "lab", "lab_id": lab_id, "risk": risk})
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


async def _pending(h):
    async with AsyncSessionLocal() as db:
        return (await db.execute(select(MaturitySuggestion).where(
            MaturitySuggestion.hypothesis_id == h, MaturitySuggestion.status == "pending"))).scalars().all()


async def _contribution(pid):
    async with AsyncSessionLocal() as db:
        return (await db.get(Prediction, pid)).lab_signal_contribution


@pytest.mark.asyncio
async def test_member_close_creates_suggestion_for_owner(client):
    await create_test_user("lm_a"); member = await create_test_user("lm_b")
    await _login(client, "lm_a")
    lab = await _lab(client, "lm-lab1"); await add_lab_member(lab, member.id, "member")
    h = await _hyp(client, lab)
    await _login(client, "lm_b")
    p = await _close(client, h, lab, "подтвердился", 10)
    c = await _contribution(p)
    assert c is not None and c >= 2.0              # контроль: вклад пересекает порог уровня 1 при risk=0
    async with AsyncSessionLocal() as db:
        assert (await db.get(Hypothesis, h)).evidence_signal == 0.0   # личный сигнал владельца не тронут
    sugs = await _pending(h)
    assert len(sugs) == 1                          # сегодня 0: пересчёт есть только в ветке владельца
    assert sugs[0].suggested_level == 1
    assert sugs[0].raw_signal == pytest.approx(c)  # свой 0 + чужой вклад


@pytest.mark.asyncio
async def test_owner_close_counts_contribution_once(client):
    await create_test_user("lm_c")
    await _login(client, "lm_c")
    lab = await _lab(client, "lm-lab2")
    h = await _hyp(client, lab)
    p = await _close(client, h, lab, "подтвердился", 10)
    c = await _contribution(p)
    async with AsyncSessionLocal() as db:
        assert (await db.get(Hypothesis, h)).evidence_signal == pytest.approx(c)  # контроль: вклад в личном
    sugs = await _pending(h)
    assert len(sugs) == 1
    assert sugs[0].raw_signal == pytest.approx(c)  # а не 2*c: вклад владельца лаборатория повторно не добавляет
