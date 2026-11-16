"""Открытые ручки модели зрелости: гость без входа, ответ совпадает с сервисом, плохой ввод отклоняется."""
import pytest

from app.services import maturity_model as mm

pytestmark = pytest.mark.asyncio


async def test_describe_is_public_and_matches_service(client):
    r = await client.get("/api/v1/meta/maturity-model")
    assert r.status_code == 200
    assert "max-age" in r.headers.get("cache-control", "")
    assert r.json() == mm.describe_model()


async def test_simulate_is_public_and_matches_service(client):
    body = {"risk": 5,
            "predictions": [{"confidence": 80, "outcome": "confirmed"},
                            {"confidence": 90, "outcome": "refuted", "confirms_if_true": False}],
            "observations": [{"sign": 1, "importance": 4}, {"sign": -1, "importance": None}],
            "lab_signal": 0.5, "history_hits": 4, "history_misses": 2, "history_confidence": 70}
    r = await client.post("/api/v1/meta/maturity-model/simulate", json=body)
    assert r.status_code == 200
    expected = mm.simulate(
        risk=5,
        predictions=[{"confidence": 80, "outcome": "confirmed", "confirms_if_true": True},
                     {"confidence": 90, "outcome": "refuted", "confirms_if_true": False}],
        observations=[{"sign": 1, "importance": 4}, {"sign": -1, "importance": None}],
        lab_signal=0.5, history_hits=4, history_misses=2, history_confidence=70)
    assert r.json() == expected


@pytest.mark.parametrize("body", [
    {"risk": mm.RISK_MAX + 1},
    {"predictions": [{"confidence": 50, "outcome": "nope"}]},
    {"observations": [{"sign": 0, "importance": 1}]},
    {"lab_signal": mm.LAB_SIGNAL_LIMIT + 1},
    {"predictions": [{"confidence": 50, "outcome": "confirmed"}] * (mm.MAX_ITEMS + 1)},
    {"unknown_field": 1},
])
async def test_simulate_rejects_bad_input(client, body):
    r = await client.post("/api/v1/meta/maturity-model/simulate", json=body)
    assert r.status_code == 422
