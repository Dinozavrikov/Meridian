"""
Тесты на счётчики статистики лаборатории.
"""
import pytest
from tests.conftest import create_test_user
from app.db.session import AsyncSessionLocal
from datetime import datetime, timezone


async def _login(client, username, password="pass12345"):
    r = await client.post("/api/v1/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200


async def _create_lab(client, name, is_public=False):
    r = await client.post("/api/v1/labs", json={
        "name": name,
        "is_public": is_public,
        "goal_type": "task",
        "new_goal_title": f"Goal for {name}",
    })
    assert r.status_code == 200, r.text
    return r.json()


@pytest.mark.asyncio
async def test_member_sees_empty_stats(client):
    await create_test_user("st_owner1")
    await _login(client, "st_owner1")
    lab = await _create_lab(client, "St Lab 1")

    r = await client.get(f"/api/v1/labs/{lab['id']}")
    assert r.status_code == 200
    d = r.json()
    assert d["observations_count"] == 0
    assert d["hypotheses_count"] == 0
    assert d["predictions_count"] == 0
    assert d["results_count"] == 0
    assert d["member_count"] == 1


@pytest.mark.asyncio
async def test_stats_with_entities(client):
    from app.models.entities import Observation, Hypothesis, Prediction

    owner = await create_test_user("st_owner2")
    await _login(client, "st_owner2")
    lab = await _create_lab(client, "St Lab 2")

    obs = Observation(
        user_id=owner.id, title="Obs 1", slug="obs-1", text="t", author="Test Author",
        date="2024-01-01", status="осмысленное", visibility="lab", lab_id=lab["id"]
    )
    hyp = Hypothesis(
        user_id=owner.id, name="Hyp 1", slug="hyp-1", description="t",
        date_created="2024-01-01", status="идея", visibility="lab", lab_id=lab["id"]
    )
    from app.models.entities import EntityHypothesis
    async with AsyncSessionLocal() as db:
        db.add(hyp)
        await db.flush()
        db.add(EntityHypothesis(
            parent_type=lab["goal_type"], parent_id=lab["goal_id"], hypothesis_id=hyp.id
        ))
        pred_open = Prediction(
            user_id=owner.id, title="Pred 1", slug="pred-1", text="t",
            date_created="2024-01-01", expected_check_date=datetime(2025, 1, 1, tzinfo=timezone.utc),
            status="не проверен", visibility="lab", lab_id=lab["id"]
        )
        pred_closed = Prediction(
            user_id=owner.id, title="Pred 2", slug="pred-2", text="t",
            date_created="2024-01-01", expected_check_date=datetime(2025, 1, 1, tzinfo=timezone.utc),
            status="подтверждён", visibility="lab", lab_id=lab["id"]
        )
        db.add_all([obs, hyp, pred_open, pred_closed])
        await db.commit()

    r = await client.get(f"/api/v1/labs/{lab['id']}")
    assert r.status_code == 200
    d = r.json()
    assert d["observations_count"] == 1
    assert d["hypotheses_count"] == 1
    assert d["predictions_count"] == 2
    # закрытый прогноз — это не Result; Result в этом тесте нет
    assert d["results_count"] == 0
    assert d["member_count"] == 1


@pytest.mark.asyncio
async def test_guest_cannot_see_private_lab_stats(client):
    await create_test_user("st_owner3")
    await _login(client, "st_owner3")
    lab = await _create_lab(client, "Private St", is_public=False)
    client.cookies.clear()

    r = await client.get(f"/api/v1/labs/{lab['id']}")
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_guest_sees_public_lab_stats(client):
    await create_test_user("st_owner4")
    await _login(client, "st_owner4")
    lab = await _create_lab(client, "Public St", is_public=True)
    client.cookies.clear()

    r = await client.get(f"/api/v1/labs/{lab['id']}")
    assert r.status_code == 200
    d = r.json()
    assert d["observations_count"] == 0
    assert d["member_count"] == 1
