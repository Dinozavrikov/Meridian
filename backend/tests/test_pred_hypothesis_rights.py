"""Права вокруг прогноза и гипотезы: закрытый прогноз нельзя вынести из лаборатории (вклад не стирается),
привязка к чужой приватной или удалённой гипотезе запрещена."""
import pytest

from tests.conftest import create_test_user
from tests.test_lab_signal import _close, _login
from tests.test_lab_maturity_votes import _setup
from app.db.session import AsyncSessionLocal
from app.services.hypothesis_evidence import lab_signal


def _pred_body(h, **over):
    body = {"title": "п", "text": "т", "date_created": "2026-08-06", "expected_check_date": "2026-12-06T00:00:00",
            "status": "не проверен", "visibility": "private", "lab_id": None, "confidence": 50, "hypothesis_id": h}
    body.update(over)
    return body


@pytest.mark.asyncio
async def test_closed_prediction_cannot_leave_lab_to_erase_its_contribution(client):
    owner, (b,), lab, h = await _setup(client, "pr1", 1)
    await _login(client, b.username)
    p = await _close(client, h, lab, "не подтвердился", 80)
    async with AsyncSessionLocal() as db:
        before = await lab_signal(db, h)
    assert before < 0                                   # контроль: минус записан
    r = await client.put(f"/api/v1/predictions/{p}", json=_pred_body(h, status="не подтвердился", confidence=80))
    assert r.status_code == 400, r.text                 # сегодня 200: прогноз спокойно уходит из лаборатории
    async with AsyncSessionLocal() as db:
        assert await lab_signal(db, h) == pytest.approx(before)


@pytest.mark.asyncio
async def test_cannot_attach_prediction_to_foreign_private_hypothesis(client):
    """ОХРАННЫЙ (зелёный и до патча)."""
    a = await create_test_user("pr2_a"); x = await create_test_user("pr2_x")
    await _login(client, a.username)
    r = await client.post("/api/v1/hypotheses/", json={"name": "Г", "description": "d", "date_created": "2026-08-06",
                                                       "status": "идея", "visibility": "private"})
    h = r.json()["id"]
    await _login(client, x.username)
    r = await client.post("/api/v1/predictions/", json=_pred_body(h))
    assert r.status_code in (403, 404), r.text


@pytest.mark.asyncio
async def test_cannot_attach_prediction_to_trashed_hypothesis(client):
    """ОХРАННЫЙ (зелёный и до патча)."""
    a = await create_test_user("pr3_a")
    await _login(client, a.username)
    r = await client.post("/api/v1/hypotheses/", json={"name": "Г", "description": "d", "date_created": "2026-08-06",
                                                       "status": "идея", "visibility": "public"})
    h = r.json()["id"]
    assert (await client.delete(f"/api/v1/hypotheses/{h}")).status_code == 204
    r = await client.post("/api/v1/predictions/", json=_pred_body(h))
    assert r.status_code in (403, 404), r.text
