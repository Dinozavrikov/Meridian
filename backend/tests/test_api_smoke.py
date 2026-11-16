"""
Smoke-тесты на API — endpoint'ы отвечают без 500.
"""

import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest.mark.asyncio
async def test_health_endpoint(client):
    r = await client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


@pytest.mark.asyncio
async def test_feed_groups_public_exists(client):
    r = await client.get("/api/v1/feed/groups/public?page=1&page_size=5")
    assert r.status_code == 200, r.text   # публичная лента открыта и гостю
    assert "groups" in r.json()
