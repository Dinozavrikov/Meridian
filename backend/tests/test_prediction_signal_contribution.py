"""predictions.signal_contribution: сколько закрытие реально внесло в сигнал гипотезы.
NULL — закрыт до колонки; 0.0 — закрыт без гипотезы; число — внесённый вклад (с калибровкой на тот момент)."""
import pytest

from tests.conftest import create_test_user
from app.db.session import AsyncSessionLocal
from app.models.entities import Hypothesis, Prediction


async def _login(client, username, password="pass12345"):
    r = await client.post("/api/v1/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200


async def _hyp(client):
    r = await client.post("/api/v1/hypotheses/", json={"name": "Г", "description": "d", "date_created": "2026-08-06",
                                                       "status": "идея", "visibility": "private"})
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


async def _closed_pred(client, hyp_id, confidence, status):
    r = await client.post("/api/v1/predictions/", json={"title": "п", "text": "т", "date_created": "2026-08-06",
        "expected_check_date": "2026-12-06T00:00:00", "status": "не проверен", "visibility": "private",
        "confidence": confidence, "hypothesis_id": hyp_id})
    assert r.status_code in (200, 201), r.text
    pid = r.json()["id"]
    r = await client.put(f"/api/v1/predictions/{pid}/close", json={"status": status, "result_notes": "итог"})
    assert r.status_code == 200, r.text
    return pid


async def _contribution(pid):
    async with AsyncSessionLocal() as db:
        return (await db.get(Prediction, pid)).signal_contribution


@pytest.mark.asyncio
async def test_saved_contributions_sum_to_hypothesis_signal(client):
    await create_test_user("sc_a"); await _login(client, "sc_a")
    h = await _hyp(client)
    p1 = await _closed_pred(client, h, 20, "подтвердился")        # неожиданный успех: плюс
    p2 = await _closed_pred(client, h, 80, "не подтвердился")     # уверенный промах: минус
    c1, c2 = await _contribution(p1), await _contribution(p2)
    assert c1 is not None and c1 > 0 and c2 is not None and c2 < 0
    async with AsyncSessionLocal() as db:
        signal = (await db.get(Hypothesis, h)).evidence_signal
    assert abs((c1 + c2) - signal) < 1e-9


@pytest.mark.asyncio
async def test_closed_without_hypothesis_saves_zero_not_null(client):
    await create_test_user("sc_b"); await _login(client, "sc_b")
    p = await _closed_pred(client, None, 50, "подтвердился")
    assert await _contribution(p) == 0.0


async def _closed_pred_dir(client, hyp_id, confirms, status="подтвердился", confidence=20):
    r = await client.post("/api/v1/predictions/", json={"title": "п", "text": "т", "date_created": "2026-08-06",
        "expected_check_date": "2026-12-06T00:00:00", "status": "не проверен", "visibility": "private",
        "confidence": confidence, "hypothesis_id": hyp_id, "confirms_hypothesis_if_true": confirms})
    assert r.status_code in (200, 201), r.text
    pid = r.json()["id"]
    r = await client.put(f"/api/v1/predictions/{pid}/close", json={"status": status, "result_notes": "итог"})
    assert r.status_code == 200, r.text
    return pid


async def _signal(h):
    async with AsyncSessionLocal() as db:
        return (await db.get(Hypothesis, h)).evidence_signal


@pytest.mark.asyncio
async def test_stress_test_flips_sign(client):
    await create_test_user("sc_c"); await _login(client, "sc_c")
    h_norm, h_stress = await _hyp(client), await _hyp(client)
    pn = await _closed_pred_dir(client, h_norm, True)
    ps = await _closed_pred_dir(client, h_stress, False)
    assert await _signal(h_norm) > 0                    # контроль: обычный сбывшийся поднимает сигнал
    assert await _signal(h_stress) < 0                  # стресс-тест сбылся, гипотеза опровергнута
    cn, cs = await _contribution(pn), await _contribution(ps)
    assert cn > 0 and cs < 0                            # размеры разные (калибровка зависит от n), знаки обратные
    assert abs(cs - await _signal(h_stress)) < 1e-9     # сохранённое число равно реальному вкладу


@pytest.mark.asyncio
async def test_stress_test_that_did_not_come_true_raises_signal(client):
    await create_test_user("sc_d"); await _login(client, "sc_d")
    h = await _hyp(client)
    await _closed_pred_dir(client, h, False, status="не подтвердился", confidence=80)
    assert await _signal(h) > 0                         # гипотеза выдержала проверку


@pytest.mark.asyncio
async def test_create_keeps_stress_test_direction(client):
    await create_test_user("sc_e"); await _login(client, "sc_e")
    h = await _hyp(client)
    r = await client.post("/api/v1/predictions/", json={"title": "п", "text": "т", "date_created": "2026-08-06",
        "expected_check_date": "2026-12-06T00:00:00", "status": "не проверен", "visibility": "private",
        "confidence": 50, "hypothesis_id": h, "confirms_hypothesis_if_true": False})
    assert r.status_code == 201, r.text
    assert r.json()["confirms_hypothesis_if_true"] is False
    pid = r.json()["id"]
    assert (await client.get(f"/api/v1/predictions/{pid}")).json()["confirms_hypothesis_if_true"] is False


@pytest.mark.asyncio
async def test_foreign_prediction_does_not_move_signal(client):
    await create_test_user("sc_own"); await create_test_user("sc_foe")
    await _login(client, "sc_own")
    r = await client.post("/api/v1/hypotheses/", json={"name": "Чужая", "description": "d", "date_created": "2026-08-06",
                                                       "status": "идея", "visibility": "public"})
    assert r.status_code in (200, 201), r.text
    h = r.json()["id"]
    await _login(client, "sc_foe")
    p = await _closed_pred_dir(client, h, True)      # привязка к чужой публичной гипотезе разрешена (can_link), закрытие тоже
    assert await _signal(h) == 0.0                   # но сигнал чужой гипотезы не двигается
    assert await _contribution(p) == 0.0
