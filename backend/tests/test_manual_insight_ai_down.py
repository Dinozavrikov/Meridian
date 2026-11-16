"""Ручной diff наблюдения: сбой ИИ даёт 503 и не оставляет строк в таблице инсайтов."""
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select

from app.db.session import AsyncSessionLocal
from app.models.entities import EntityReflection, EntityReflectionInsight
from app.services.ai import AIUnavailable
from tests.conftest import create_test_user


async def _login(client, username, password="pass12345"):
    r = await client.post("/api/v1/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200


async def _obs_with_two_versions(client):
    r = await client.post("/api/v1/observations/", json={
        "title": "t", "date": "2026-09-23", "author": "tester", "text": "body",
        "lab_id": None, "visibility": "private",
    })
    assert r.status_code == 201, r.text
    oid = r.json()["id"]
    now = datetime.now(timezone.utc)
    async with AsyncSessionLocal() as db:
        for i, w in enumerate((1, 3)):
            db.add(EntityReflection(
                entity_type="observation", entity_id=oid, stage="creation",
                factors=[{"factor": "работа", "weight": w}], created_at=now + timedelta(seconds=i),
            ))
        await db.commit()
    return oid


async def _insight_count():
    async with AsyncSessionLocal() as db:
        return await db.scalar(select(func.count()).select_from(EntityReflectionInsight))


async def test_ai_down_returns_503_and_saves_nothing(client, monkeypatch):
    await create_test_user("mi_owner1")
    await _login(client, "mi_owner1")
    oid = await _obs_with_two_versions(client)

    async def down(*a, **kw):
        raise AIUnavailable(AIUnavailable.USER_MESSAGE)
    monkeypatch.setattr("app.api.v1.observations.diff_reflections", down)

    r = await client.post(f"/api/v1/observations/{oid}/reflections/insights/manual")
    assert r.status_code == 503
    assert r.json()["detail"] == AIUnavailable.USER_MESSAGE
    assert await _insight_count() == 0


async def test_ai_ok_saves_exactly_one_row(client, monkeypatch):
    await create_test_user("mi_owner2")
    await _login(client, "mi_owner2")
    oid = await _obs_with_two_versions(client)

    async def ok(*a, **kw):
        return {"matched": [], "added": [], "dropped": [], "insight": "Данных мало."}
    monkeypatch.setattr("app.api.v1.observations.diff_reflections", ok)

    r = await client.post(f"/api/v1/observations/{oid}/reflections/insights/manual")
    assert r.status_code == 200, r.text
    assert r.json()["insight"] == "Данных мало."
    assert await _insight_count() == 1


async def test_handler_maps_ai_unavailable_to_503(client):
    """Общий обработчик: любой эндпоинт, где ИИ бросил AIUnavailable, отвечает 503."""
    from app.main import app

    @app.get("/__test/ai-down")
    async def _ai_down():
        raise AIUnavailable(AIUnavailable.USER_MESSAGE)

    r = await client.get("/__test/ai-down")
    assert r.status_code == 503
    assert r.json() == {"detail": AIUnavailable.USER_MESSAGE}
