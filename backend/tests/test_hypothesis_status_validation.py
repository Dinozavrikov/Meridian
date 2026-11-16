"""Статус гипотезы: на входе принимаются ТОЛЬКО статусы из core/hypothesis_status.py. Раньше колонка была
свободной строкой, а список жил только на фронте (форма гипотез) и в трёх группах статистики профиля."""
from typing import get_args

import pytest

from app.api.v1 import users as users_module
from app.core.hypothesis_status import (
    CONFIRMED_HYPOTHESIS_STATUSES, DEFAULT_HYPOTHESIS_STATUS, HYPOTHESIS_STATUSES,
    PENDING_HYPOTHESIS_STATUSES, REJECTED_HYPOTHESIS_STATUSES,
)
from app.models.entities import Hypothesis
from app.schemas.entities import HypCreate, HypothesisStatus

BAD = ["отложен", "", "не-статус", "открыт"]


async def _login(client, username="testuser", password="testpass123"):
    r = await client.post("/api/v1/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200


def _body(**kw):
    return {"name": "Гипотеза", "description": "d", "date_created": "2026-10-10", **kw}


def test_literal_matches_core_constants():
    assert tuple(get_args(HypothesisStatus)) == HYPOTHESIS_STATUSES


def test_groups_partition_all_statuses_without_overlap():
    groups = (CONFIRMED_HYPOTHESIS_STATUSES, PENDING_HYPOTHESIS_STATUSES, REJECTED_HYPOTHESIS_STATUSES)
    assert sum(len(g) for g in groups) == len(HYPOTHESIS_STATUSES)
    assert set().union(*map(set, groups)) == set(HYPOTHESIS_STATUSES)


def test_profile_stats_use_the_shared_groups():
    assert users_module.CONFIRMED_STATUSES == set(CONFIRMED_HYPOTHESIS_STATUSES)
    assert users_module.PENDING_STATUSES == set(PENDING_HYPOTHESIS_STATUSES)
    assert users_module.REJECTED_STATUSES == set(REJECTED_HYPOTHESIS_STATUSES)


def test_defaults_are_valid_statuses():
    assert DEFAULT_HYPOTHESIS_STATUS in HYPOTHESIS_STATUSES
    assert HypCreate.model_fields["status"].default == DEFAULT_HYPOTHESIS_STATUS
    column_default = getattr(Hypothesis.__table__.c.status.default, "arg", None)
    assert column_default in HYPOTHESIS_STATUSES, f"дефолт колонки: {column_default!r}"


@pytest.mark.asyncio
@pytest.mark.parametrize("status", HYPOTHESIS_STATUSES)
async def test_every_status_is_accepted_and_persisted(client, test_user, status):
    await _login(client)
    r = await client.post("/api/v1/hypotheses/", json=_body(status=status))
    assert r.status_code == 201, r.text
    assert (await client.get(f"/api/v1/hypotheses/{r.json()['id']}")).json()["status"] == status


@pytest.mark.asyncio
@pytest.mark.parametrize("bad", BAD)
async def test_create_rejects_unknown_status(client, test_user, bad):
    await _login(client)
    assert (await client.post("/api/v1/hypotheses/", json=_body(status=bad))).status_code == 422


@pytest.mark.asyncio
@pytest.mark.parametrize("bad", BAD)
async def test_update_rejects_unknown_status_and_keeps_record(client, test_user, bad):
    await _login(client)
    created = (await client.post("/api/v1/hypotheses/", json=_body(status="идея", name="Исходное"))).json()
    r = await client.put(f"/api/v1/hypotheses/{created['id']}", json=_body(status=bad, name="Изменённое"))
    assert r.status_code == 422
    after = (await client.get(f"/api/v1/hypotheses/{created['id']}")).json()
    assert after["status"] == "идея" and after["name"] == "Исходное"


@pytest.mark.asyncio
async def test_update_moves_between_valid_statuses(client, test_user):
    await _login(client)
    created = (await client.post("/api/v1/hypotheses/", json=_body(status="идея"))).json()
    r = await client.put(f"/api/v1/hypotheses/{created['id']}", json=_body(status="подтвердилось"))
    assert r.status_code == 200, r.text
    assert (await client.get(f"/api/v1/hypotheses/{created['id']}")).json()["status"] == "подтвердилось"
