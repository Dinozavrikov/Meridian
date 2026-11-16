"""Прогноз: уверенность строго 0..100, статус — только из PredictionStatus.
Раньше confidence был Int32 без диапазона (500 -> p=5.0 в Brier), статус — свободной строкой."""
from typing import get_args

import pytest

from app.core.prediction_status import CLOSED_PREDICTION_STATUSES
from app.schemas.entities import PredictionStatus

OPEN_PREDICTION_STATUS = "не проверен"  # отдельной константы в core нет


async def _login(client, username="testuser", password="testpass123"):
    r = await client.post("/api/v1/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200


def _body(**kw):
    return {"text": "x", "date_created": "2026-10-10", "expected_check_date": "2027-01-01T00:00:00Z", **kw}


def test_literal_matches_core_constants():
    assert list(get_args(PredictionStatus)) == [OPEN_PREDICTION_STATUS, *CLOSED_PREDICTION_STATUSES]


@pytest.mark.asyncio
@pytest.mark.parametrize("conf", [0, 50, 100])
async def test_boundary_confidence_is_accepted_and_persisted(client, test_user, conf):
    await _login(client)
    r = await client.post("/api/v1/predictions/", json=_body(confidence=conf))
    assert r.status_code == 201
    assert (await client.get(f"/api/v1/predictions/{r.json()['id']}")).json()["confidence"] == conf


@pytest.mark.asyncio
@pytest.mark.parametrize("conf", [-1, 101, 500, 10**9])
async def test_create_rejects_out_of_range_confidence(client, test_user, conf):
    await _login(client)
    assert (await client.post("/api/v1/predictions/", json=_body(confidence=conf))).status_code == 422


@pytest.mark.asyncio
@pytest.mark.parametrize("conf", [-1, 101, 500])
async def test_update_rejects_out_of_range_confidence_and_keeps_record(client, test_user, conf):
    await _login(client)
    created = (await client.post("/api/v1/predictions/", json=_body(confidence=60, text="original"))).json()
    r = await client.put(f"/api/v1/predictions/{created['id']}", json=_body(confidence=conf, text="changed"))
    assert r.status_code == 422
    after = (await client.get(f"/api/v1/predictions/{created['id']}")).json()
    assert after["confidence"] == 60 and after["text"] == "original"


@pytest.mark.asyncio
async def test_confidence_may_be_omitted(client, test_user):
    """Репост/онбординг и старые клиенты шлют прогноз без уверенности — это допустимо (но в калибровку он не попадает)."""
    await _login(client)
    r = await client.post("/api/v1/predictions/", json=_body())
    assert r.status_code == 201
    assert (await client.get(f"/api/v1/predictions/{r.json()['id']}")).json()["confidence"] is None


@pytest.mark.asyncio
@pytest.mark.parametrize("bad", ["отложен", "", "не-статус"])
async def test_create_rejects_unknown_status(client, test_user, bad):
    await _login(client)
    assert (await client.post("/api/v1/predictions/", json=_body(status=bad))).status_code == 422


@pytest.mark.asyncio
@pytest.mark.parametrize("bad", ["отложен", "", "не-статус"])
async def test_update_rejects_unknown_status_and_keeps_record(client, test_user, bad):
    await _login(client)
    created = (await client.post("/api/v1/predictions/", json=_body(text="original"))).json()
    r = await client.put(f"/api/v1/predictions/{created['id']}", json=_body(status=bad, text="changed"))
    assert r.status_code == 422
    after = (await client.get(f"/api/v1/predictions/{created['id']}")).json()
    assert after["status"] == OPEN_PREDICTION_STATUS and after["text"] == "original"
