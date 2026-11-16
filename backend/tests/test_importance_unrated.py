"""importance у наблюдений и вопросов: None = «не оценено», 0 = «оценено как наименьшее».
Тесты шлют настоящие запросы и читают результат обратно, а не проверяют наличие кода."""
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select

from app.db.session import get_db, AsyncSessionLocal
from app.main import app
from app.models.entities import Event, Observation
from app.services.undo import apply_undo, evaluate_undo
from tests.conftest import create_test_user

pytestmark = pytest.mark.asyncio

# Тела БЕЗ ключа importance — именно это и проверяем.
_OBS = {"date": "2026-10-13", "author": "tester", "title": "Заголовок", "text": "<p>body</p>",
        "status": "осмысленное", "visibility": "private", "lab_id": None, "tags": []}
_Q = {"title": "Вопрос", "text": "", "status": "открыт", "priority": "средний", "answer": "",
      "date_created": "2026-10-13", "visibility": "private", "lab_id": None, "tags": []}
KINDS = pytest.mark.parametrize("kind,base", [("observations", _OBS), ("questions", _Q)], ids=["observation", "question"])


@pytest_asyncio.fixture
async def api():
    async def override_get_db():
        async with AsyncSessionLocal() as session:
            yield session
    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app, raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        await create_test_user("impnull")
        r = await c.post("/api/v1/auth/login", json={"username": "impnull", "password": "pass12345"})
        assert r.status_code == 200, r.text
        yield c
    app.dependency_overrides.pop(get_db, None)


async def _create(api, kind, base, **extra):
    r = await api.post(f"/api/v1/{kind}/", json={**base, **extra})
    assert r.status_code == 201, r.text
    return r.json()


async def _get(api, kind, eid):
    r = await api.get(f"/api/v1/{kind}/{eid}")
    assert r.status_code == 200, r.text
    return r.json()


async def _put(api, kind, eid, body):
    r = await api.put(f"/api/v1/{kind}/{eid}", json=body)
    assert r.status_code == 200, r.text
    return r.json()


@KINDS
async def test_create_without_importance_is_unrated(api, kind, base):
    created = await _create(api, kind, base)
    assert created["importance"] is None
    assert (await _get(api, kind, created["id"]))["importance"] is None


@KINDS
async def test_create_with_zero_is_rated_zero_not_unrated(api, kind, base):
    created = await _create(api, kind, base, importance=0)
    assert (await _get(api, kind, created["id"]))["importance"] == 0


@KINDS
async def test_put_without_field_keeps_value(api, kind, base):
    created = await _create(api, kind, base, importance=3)
    updated = await _put(api, kind, created["id"], {**base, "title": "Новое название"})  # ключа importance нет
    assert updated["title"] == "Новое название"          # PUT действительно применился
    assert updated["importance"] == 3                    # а значимость не тронута
    assert (await _get(api, kind, created["id"]))["importance"] == 3


@KINDS
async def test_put_without_field_keeps_unrated(api, kind, base):
    created = await _create(api, kind, base)
    await _put(api, kind, created["id"], {**base, "title": "Новое название"})
    assert (await _get(api, kind, created["id"]))["importance"] is None


@KINDS
async def test_put_null_clears_value(api, kind, base):
    created = await _create(api, kind, base, importance=4)
    await _put(api, kind, created["id"], {**base, "importance": None})
    assert (await _get(api, kind, created["id"]))["importance"] is None


@KINDS
async def test_put_zero_rates_an_unrated_record(api, kind, base):
    created = await _create(api, kind, base)
    await _put(api, kind, created["id"], {**base, "importance": 0})
    assert (await _get(api, kind, created["id"]))["importance"] == 0


async def test_undo_returns_observation_to_unrated(api):
    created = await _create(api, "observations", _OBS)
    oid = created["id"]
    await _put(api, "observations", oid, {**_OBS, "importance": 4})
    async with AsyncSessionLocal() as s:
        obs = await s.get(Observation, oid)
        ev = (await s.execute(
            select(Event).where(Event.entity_type == "observation", Event.entity_id == oid, Event.type == "updated")
            .order_by(Event.id.desc())
        )).scalars().first()
        assert ev.meta["changed_fields"]["importance"] == {"old": None, "new": 4}
        verdict = evaluate_undo(obs, "observation", ev)
        assert verdict.ok, verdict
        apply_undo(obs, ev)
        await s.commit()
    assert (await _get(api, "observations", oid))["importance"] is None
