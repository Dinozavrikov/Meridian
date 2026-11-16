"""Дашборд: urgent_preds отдаёт направление прогноза (стресс-тест) и уверенность: по ним окно закрытия предупреждает."""
import pytest

from tests.conftest import create_test_user


async def _login(client, username, password="pass12345"):
    r = await client.post("/api/v1/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200


async def _hyp(client):
    r = await client.post("/api/v1/hypotheses/", json={"name": "Г", "description": "d", "date_created": "2026-08-06",
                                                       "status": "идея", "visibility": "private"})
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


async def _pred(client, hyp_id, confirms, confidence):
    r = await client.post("/api/v1/predictions/", json={"title": "п", "text": "т", "date_created": "2026-08-06",
        "expected_check_date": "2020-01-01T00:00:00", "status": "не проверен", "visibility": "private",
        "confidence": confidence, "hypothesis_id": hyp_id, "confirms_hypothesis_if_true": confirms})
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


@pytest.mark.asyncio
async def test_urgent_preds_carry_direction_and_confidence(client):
    await create_test_user("ud_a"); await _login(client, "ud_a")
    h = await _hyp(client)
    stress = await _pred(client, h, False, 30)
    normal = await _pred(client, h, True, None)
    r = await client.get("/api/v1/stats/dashboard")
    assert r.status_code == 200, r.text
    by = {p["id"]: p for p in r.json()["urgent_preds"]}
    assert set(by) == {stress, normal}                      # контроль: оба просрочены и попали в список
    assert by[stress]["confirms_hypothesis_if_true"] is False and by[stress]["confidence"] == 30
    assert by[normal]["confirms_hypothesis_if_true"] is True and by[normal]["confidence"] is None
