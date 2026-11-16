"""Закрытый прогноз: гипотезу через PUT менять нельзя (вклад уже влит в сигнал исходной), открытый — можно."""
import pytest

from tests.conftest import create_test_user


async def _login(client, username, password="pass12345"):
    r = await client.post("/api/v1/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200


async def _hyp(client, name):
    r = await client.post("/api/v1/hypotheses/", json={"name": name, "description": "d", "date_created": "2026-08-06",
                                                       "status": "идея", "visibility": "private"})
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


async def _pred(client, hyp_id):
    r = await client.post("/api/v1/predictions/", json={"title": "п", "text": "т", "date_created": "2026-08-06",
        "expected_check_date": "2026-12-06T00:00:00", "status": "не проверен", "visibility": "private",
        "confidence": 50, "hypothesis_id": hyp_id})
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


def _put(pid, hyp_id, status):
    return {"title": "п", "text": "т", "date_created": "2026-08-06", "expected_check_date": "2026-12-06T00:00:00",
            "hypothesis_id": hyp_id, "status": status, "confidence": 50}


@pytest.mark.asyncio
async def test_closed_prediction_cannot_be_moved_to_another_hypothesis(client):
    await create_test_user("rl_a"); await _login(client, "rl_a")
    h1, h2 = await _hyp(client, "Г1"), await _hyp(client, "Г2")
    p = await _pred(client, h1)
    r = await client.put(f"/api/v1/predictions/{p}/close", json={"status": "подтвердился", "result_notes": "сбылось"})
    assert r.status_code == 200, r.text
    # контроль: тот же запрос без смены гипотезы проходит, значит 400 ниже именно из-за гипотезы
    r = await client.put(f"/api/v1/predictions/{p}", json=_put(p, h1, "подтвердился"))
    assert r.status_code == 200, r.text
    r = await client.put(f"/api/v1/predictions/{p}", json=_put(p, h2, "подтвердился"))
    assert r.status_code == 400, r.text
    assert (await client.get(f"/api/v1/predictions/{p}")).json()["hypothesis_id"] == h1


@pytest.mark.asyncio
async def test_open_prediction_can_still_be_moved(client):
    await create_test_user("rl_b"); await _login(client, "rl_b")
    h1, h2 = await _hyp(client, "Г1"), await _hyp(client, "Г2")
    p = await _pred(client, h1)
    r = await client.put(f"/api/v1/predictions/{p}", json=_put(p, h2, "не проверен"))
    assert r.status_code == 200, r.text
    assert (await client.get(f"/api/v1/predictions/{p}")).json()["hypothesis_id"] == h2
