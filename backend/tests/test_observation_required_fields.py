"""title и text наблюдения обязательны и на create, и на update: пустое значение даёт 422
и ничего не меняет в БД. Тесты шлют реальные запросы, а не проверяют наличие валидатора."""
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport

from app.db.session import get_db, AsyncSessionLocal
from app.main import app
from tests.conftest import create_test_user

pytestmark = pytest.mark.asyncio

_OBS = {"date": "2026-09-28", "author": "tester", "title": "Заголовок", "text": "<p>body</p>",
        "importance": 0, "status": "осмысленное", "visibility": "private", "lab_id": None, "tags": []}
URL = "/api/v1/observations/"

BAD_TITLES = ["", "   ", "\t\n"]
BAD_TEXTS = ["", "   ", "<p></p>", "<p><br></p>", "<p>&nbsp;</p>"]


@pytest_asyncio.fixture
async def api():
    async def override_get_db():
        async with AsyncSessionLocal() as session:
            yield session
    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app, raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        await create_test_user("reqfields")
        r = await c.post("/api/v1/auth/login", json={"username": "reqfields", "password": "pass12345"})
        assert r.status_code == 200, r.text
        yield c
    app.dependency_overrides.pop(get_db, None)


async def _count(api):
    r = await api.get(URL)
    assert r.status_code == 200, r.text
    body = r.json()
    return len(body["items"] if isinstance(body, dict) and "items" in body else body)


@pytest.mark.parametrize("title", BAD_TITLES)
async def test_create_rejects_blank_title(api, title):
    r = await api.post(URL, json={**_OBS, "title": title})
    assert r.status_code == 422, r.text
    assert await _count(api) == 0


async def test_create_rejects_missing_title(api):
    body = {k: v for k, v in _OBS.items() if k != "title"}
    r = await api.post(URL, json=body)
    assert r.status_code == 422, r.text
    assert await _count(api) == 0


@pytest.mark.parametrize("text", BAD_TEXTS)
async def test_create_rejects_blank_text(api, text):
    r = await api.post(URL, json={**_OBS, "text": text})
    assert r.status_code == 422, r.text
    assert await _count(api) == 0


async def test_create_strips_title(api):
    r = await api.post(URL, json={**_OBS, "title": "  Хороший заголовок  "})
    assert r.status_code == 201, r.text
    assert r.json()["title"] == "Хороший заголовок"


@pytest.mark.parametrize("field,bad", [("title", t) for t in BAD_TITLES] + [("text", t) for t in BAD_TEXTS])
async def test_update_rejects_blank_and_keeps_old_values(api, field, bad):
    created = await api.post(URL, json=_OBS)
    assert created.status_code == 201, created.text
    oid = created.json()["id"]

    r = await api.put(f"{URL}{oid}", json={**_OBS, field: bad})
    assert r.status_code == 422, r.text

    after = (await api.get(f"{URL}{oid}")).json()
    assert after["title"] == _OBS["title"]
    assert after["text"] == _OBS["text"]
