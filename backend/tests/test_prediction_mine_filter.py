"""
Регрессионный тест на баг: страница /predictions использовала общий
GET /predictions/ (все видимые: свои + публичные + доступные по лабам)
для персонального виджета "Очередь проверки" — из-за этого в очередь
попадали и чужие публичные прогнозы. Исправлено параметром `mine=true`
на list_preds, сужающим существующий visibility-фильтр (never расширяет
доступ — только AND поверх него).
"""
import pytest
from tests.conftest import create_test_user


async def _login(client, username, password="pass12345"):
    r = await client.post("/api/v1/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_mine_excludes_others_public_prediction(client):
    await create_test_user("mine_owner1")
    await create_test_user("mine_other1")

    await _login(client, "mine_owner1")
    r = await client.post("/api/v1/predictions/", json={
        "title": "Owner's public pred", "text": "some text", "date_created": "2026-08-11",
        "expected_check_date": "2027-01-01T00:00:00", "visibility": "public",
    })
    assert r.status_code == 201, r.text

    await _login(client, "mine_other1")
    r = await client.get("/api/v1/predictions/", params={"mine": True})
    assert r.status_code == 200, r.text
    titles = [p["title"] for p in r.json()]
    assert "Owner's public pred" not in titles, (
        "mine=true не должен показывать чужой публичный прогноз — "
        "именно этот баг был на скриншоте /predictions"
    )


@pytest.mark.asyncio
async def test_mine_includes_own_private_prediction(client):
    await create_test_user("mine_owner2")
    await _login(client, "mine_owner2")

    r = await client.post("/api/v1/predictions/", json={
        "title": "My private pred", "text": "some text", "date_created": "2026-08-11",
        "expected_check_date": "2027-01-01T00:00:00", "visibility": "private",
    })
    assert r.status_code == 201, r.text

    r = await client.get("/api/v1/predictions/", params={"mine": True})
    assert r.status_code == 200, r.text
    titles = [p["title"] for p in r.json()]
    assert "My private pred" in titles


@pytest.mark.asyncio
async def test_mine_without_auth_returns_401(client):
    r = await client.get("/api/v1/predictions/", params={"mine": True})
    assert r.status_code == 401, "mine=true без авторизации должен требовать логин, не отдавать пустой/чужой список"


@pytest.mark.asyncio
async def test_without_mine_still_shows_others_public_prediction(client):
    """Контрольный тест: без mine поведение НЕ меняется — общий список
    /predictions по-прежнему должен показывать публичные прогнозы других
    пользователей (это не баг, это то, для чего list_preds и задуман)."""
    await create_test_user("ctrl_owner1")
    await create_test_user("ctrl_other1")

    await _login(client, "ctrl_owner1")
    r = await client.post("/api/v1/predictions/", json={
        "title": "Ctrl public pred", "text": "some text", "date_created": "2026-08-11",
        "expected_check_date": "2027-01-01T00:00:00", "visibility": "public",
    })
    assert r.status_code == 201, r.text

    await _login(client, "ctrl_other1")
    r = await client.get("/api/v1/predictions/")
    assert r.status_code == 200, r.text
    titles = [p["title"] for p in r.json()]
    assert "Ctrl public pred" in titles
