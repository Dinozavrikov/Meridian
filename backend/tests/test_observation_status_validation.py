"""Статус наблюдения: на входе принимаются ТОЛЬКО четыре стадии зрелости.
Раньше колонка была свободной строкой, а quick-add слал собственные «требует
уточнения»/«устарело», которые не попадали ни на одну ступень степпера."""
from typing import get_args

import pytest

from app.models.entities import Observation
from app.schemas.entities import ObservationStatus

STAGES = list(get_args(ObservationStatus))
BAD = ["требует уточнения", "устарело", "", "не-стадия"]


async def _login(client, username="testuser", password="testpass123"):
    r = await client.post("/api/v1/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200


def _body(**kw):
    return {"date": "2026-10-10", "author": "T", "title": "T", "text": "x", **kw}


def test_stages_are_the_four_maturation_stages():
    assert STAGES == ["сырое", "осмысленное", "интегрированное", "архивное"]


def test_defaults_of_other_writers_are_valid_stages():
    # Репост не задаёт статус — берётся дефолт колонки; онбординг пишет "сырое".
    assert Observation.__table__.c.status.default.arg in STAGES
    assert "сырое" in STAGES


@pytest.mark.asyncio
@pytest.mark.parametrize("stage", STAGES)
async def test_every_stage_is_accepted_and_persisted(client, test_user, stage):
    await _login(client)
    r = await client.post("/api/v1/observations/", json=_body(status=stage))
    assert r.status_code == 201
    got = await client.get(f"/api/v1/observations/{r.json()['id']}")
    assert got.json()["status"] == stage


@pytest.mark.asyncio
@pytest.mark.parametrize("bad", BAD)
async def test_create_rejects_unknown_status(client, test_user, bad):
    await _login(client)
    r = await client.post("/api/v1/observations/", json=_body(status=bad))
    assert r.status_code == 422
    assert any(e["loc"][-1] == "status" for e in r.json()["detail"]), r.text


@pytest.mark.asyncio
@pytest.mark.parametrize("bad", BAD)
async def test_update_rejects_unknown_status_and_keeps_record(client, test_user, bad):
    await _login(client)
    created = (await client.post("/api/v1/observations/", json=_body(status="сырое", text="original"))).json()
    r = await client.put(f"/api/v1/observations/{created['id']}", json=_body(status=bad, text="changed"))
    assert r.status_code == 422
    assert any(e["loc"][-1] == "status" for e in r.json()["detail"]), r.text
    after = (await client.get(f"/api/v1/observations/{created['id']}")).json()
    assert after["status"] == "сырое" and after["text"] == "original"


@pytest.mark.asyncio
async def test_update_moves_between_valid_stages(client, test_user):
    await _login(client)
    created = (await client.post("/api/v1/observations/", json=_body(status="сырое"))).json()
    r = await client.put(f"/api/v1/observations/{created['id']}", json=_body(status="интегрированное"))
    assert r.status_code == 200
    assert (await client.get(f"/api/v1/observations/{created['id']}")).json()["status"] == "интегрированное"
