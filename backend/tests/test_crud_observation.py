"""
CRUD-тесты на Observation + проверка изоляции private записей.
"""
import pytest


async def _login(client, username="testuser", password="testpass123"):
    r = await client.post("/api/v1/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_create_observation(client, test_user):
    await _login(client)
    r = await client.post("/api/v1/observations/", json={
        "date": "2026-08-05",
        "author": "Test",
        "title": "Test observation",
        "text": "Something observed",
        "status": "осмысленное",
    })
    assert r.status_code == 201
    data = r.json()
    assert data["text"] == "Something observed"
    assert "id" in data


@pytest.mark.asyncio
async def test_read_observation(client, test_user):
    await _login(client)
    created = (await client.post("/api/v1/observations/", json={
        "date": "2026-08-05", "author": "Test", "title": "Read me", "text": "Read me",
    })).json()
    r = await client.get(f"/api/v1/observations/{created['id']}")
    assert r.status_code == 200
    assert r.json()["text"] == "Read me"


@pytest.mark.asyncio
async def test_update_observation(client, test_user):
    await _login(client)
    created = (await client.post("/api/v1/observations/", json={
        "date": "2026-08-05", "author": "Test", "title": "Before update", "text": "Before update",
    })).json()
    r = await client.put(f"/api/v1/observations/{created['id']}", json={
        "date": "2026-08-05", "author": "Test", "title": "After update", "text": "After update",
    })
    assert r.status_code == 200
    assert r.json()["text"] == "After update"


@pytest.mark.asyncio
async def test_delete_observation(client, test_user):
    await _login(client)
    created = (await client.post("/api/v1/observations/", json={
        "date": "2026-08-05", "author": "Test", "title": "To delete", "text": "To delete",
    })).json()
    r = await client.delete(f"/api/v1/observations/{created['id']}")
    assert r.status_code == 204
    r2 = await client.get(f"/api/v1/observations/{created['id']}")
    assert r2.status_code == 404


@pytest.mark.asyncio
async def test_private_observation_isolated(client):
    """Приватное наблюдение одного пользователя не должно быть видно другому
    гостю/пользователю без доступа — базовая проверка изоляции access model."""
    from app.models.user import User
    from app.core.security import hash_password

    owner = User(username="owner1", email="owner1@example.com",
                 password_hash=hash_password("ownerpass123"), display_name="Owner")
    other = User(username="other1", email="other1@example.com",
                 password_hash=hash_password("otherpass123"), display_name="Other")
    from app.db.session import AsyncSessionLocal
    async with AsyncSessionLocal() as db:
        db.add_all([owner, other])
        await db.commit()

    await _login(client, "owner1", "ownerpass123")
    created = (await client.post("/api/v1/observations/", json={
        "date": "2026-08-05", "author": "Owner", "title": "Secret observation", "text": "Secret observation",
        "visibility": "private",
    })).json()

    await _login(client, "other1", "otherpass123")
    r = await client.get(f"/api/v1/observations/{created['id']}")
    assert r.status_code == 403
