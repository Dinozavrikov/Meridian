"""Стартовые прогнозы, которые создаёт регистрация (api/v1/auth.py), пишут статус напрямую в модель,
минуя схему PredCreate, поэтому Literal статуса их не проверяет. Здесь — реальная регистрация и проверка
сохранённых значений: статус обязан быть допустимым и открытым (иначе прогноз не попадёт ни в очередь
проверки, ни в закрытие)."""
from typing import get_args

import pytest

from app.core.prediction_status import OPEN_PREDICTION_STATUS
from app.schemas.entities import PredictionStatus


@pytest.mark.asyncio
async def test_registration_creates_two_open_onboarding_predictions(client, monkeypatch):
    from app.api.v1 import auth as auth_module

    async def _ok(*args, **kwargs):
        return True
    monkeypatch.setattr(auth_module, "_verify_turnstile", _ok)

    r = await client.post("/api/v1/auth/register", json={
        "username": "onb_user", "email": "onb@example.com", "password": "newpass123", "turnstile_token": "t",
    })
    assert r.status_code == 200, r.text

    listed = await client.get("/api/v1/predictions/", params={"mine": True})
    assert listed.status_code == 200, listed.text
    onboarding = [p for p in listed.json() if p["is_onboarding"]]
    assert len(onboarding) == 2
    for p in onboarding:
        assert p["status"] == OPEN_PREDICTION_STATUS
        assert p["status"] in get_args(PredictionStatus)
        assert p["hypothesis_id"] is not None
