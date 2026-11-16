"""Недопустимый ввод в схемах сущностей даёт 422, а не 500 из БД. Клиент с
raise_app_exceptions=False: необработанная ошибка приложения должна стать 500-м ответом, а не
исключением теста. Хорошие значения проверяются так же, чтобы строгость не ломала легальный ввод."""
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport

from app.db.session import get_db, AsyncSessionLocal
from app.main import app
from tests.conftest import create_test_user

pytestmark = pytest.mark.asyncio

_OBS = {"date": "2026-09-28", "author": "tester", "title": "A", "text": "body", "importance": 0,
        "status": "осмысленное", "visibility": "private", "lab_id": None, "tags": []}


@pytest_asyncio.fixture
async def api():
    async def override_get_db():
        async with AsyncSessionLocal() as session:
            yield session
    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app, raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        await create_test_user("strictuser")
        r = await c.post("/api/v1/auth/login", json={"username": "strictuser", "password": "pass12345"})
        assert r.status_code == 200, r.text
        yield c
    app.dependency_overrides.pop(get_db, None)


BAD = [
    ("text", "a\u0000b"), ("title", "x\u0000"), ("author", "x\u0001y"),
    ("title", "x" * 256), ("author", "x" * 129), ("status", "x" * 65),
    ("date", "2026-09-28T00:00:00"), ("importance", 2 ** 40),
    ("visibility", "x" * 17), ("visibility", "хм"),
    ("tags", ["a\u0000"]), ("tags", ["x" * 129]),
]


@pytest.mark.parametrize("field,value", BAD, ids=[f"{f}={repr(v)[:24]}" for f, v in BAD])
async def test_observation_rejects_bad_input_with_422(api, field, value):
    r = await api.post("/api/v1/observations/", json={**_OBS, field: value})
    assert r.status_code == 422, (field, r.status_code, r.text[:200])


async def test_observation_update_rejects_bad_input_with_422(api):
    created = await api.post("/api/v1/observations/", json=_OBS)
    assert created.status_code == 201, created.text
    r = await api.put(f"/api/v1/observations/{created.json()['id']}", json={**_OBS, "text": "a\u0000b"})
    assert r.status_code == 422, (r.status_code, r.text[:200])


async def test_legitimate_input_still_accepted(api):
    ok = {**_OBS, "title": "x" * 255, "author": "я" * 128, "text": "строка1\nстрока2\tтаб\r\n<p>html</p>",
          "tags": ["тег", "x" * 128], "visibility": "public", "importance": 5}
    r = await api.post("/api/v1/observations/", json=ok)
    assert r.status_code == 201, r.text
    assert r.json()["text"] == ok["text"]  # ничего не переписано: ни переносы, ни HTML


# Для боевых данных важно: проверка не должна трогать уже сохранённое
async def test_stored_text_roundtrips_unchanged(api):
    created = await api.post("/api/v1/observations/", json={**_OBS, "text": "  пробелы  \n\n"})
    got = await api.get(f"/api/v1/observations/{created.json()['id']}")
    assert got.json()["text"] == "  пробелы  \n\n"


# Пути и тела — мои предположения по именам роутеров; чистый запрос в тесте служит контролем:
# неверный путь или поле упадут на нём (404/422), а не пройдут «ложно» как отказ на NUL.
_CREATE = {
    "observations": ("/api/v1/observations/", _OBS, "text"),
    "hypotheses": ("/api/v1/hypotheses/", {"name": "H", "description": "d", "date_created": "2026-09-28"}, "description"),
    "predictions": ("/api/v1/predictions/", {"title": "p", "text": "t", "date_created": "2026-09-28",
                                              "expected_check_date": "2026-12-01T00:00:00Z"}, "text"),
    "worldview": ("/api/v1/worldview/", {"date": "2026-09-28", "belief": "b"}, "belief"),
    "questions": ("/api/v1/questions/", {"title": "q", "date_created": "2026-09-28"}, "text"),
    "tasks": ("/api/v1/tasks/", {"name": "t"}, "description"),
}


@pytest.mark.parametrize("name", list(_CREATE))
async def test_every_create_endpoint_rejects_nul_but_accepts_clean(api, name):
    path, base, field = _CREATE[name]
    ok = await api.post(path, json={**base, field: "clean"})
    assert ok.status_code in (200, 201), (path, ok.status_code, ok.text[:200])
    bad = await api.post(path, json={**base, field: "a\u0000b"})
    assert bad.status_code == 422, (path, bad.status_code)


@pytest.mark.parametrize("url", ["example.com", "ftp://x.org/a", "javascript:alert(1)", "http://",
                                  "https://exa mple.com", "http://" + "a" * 2050, "http://a.org/\u0000"])
async def test_source_url_rejected_at_input(api, url):
    # проверяем только отказы: успешный запрос запустил бы фоновый скрапинг по сети
    r = await api.post("/api/v1/hypothesis/1/sources", json={"url": url})
    assert r.status_code == 422, (url[:30], r.status_code, r.text[:200])


async def test_422_detail_shape_matches_frontend_contract(api):
    """frontend/lib/api-error.ts: наши сообщения приходят как "Value error, <русский текст>",
    встроенные ограничения (длина) — без этого префикса и показываются фронтом общим текстом."""
    nul = await api.post("/api/v1/observations/", json={**_OBS, "text": "a\u0000b"})
    assert nul.status_code == 422
    msgs = [d["msg"] for d in nul.json()["detail"]]
    assert any(m == "Value error, Недопустимые управляющие символы" for m in msgs), msgs

    long_title = await api.post("/api/v1/observations/", json={**_OBS, "title": "x" * 256})
    assert long_title.status_code == 422
    assert all(not d["msg"].startswith("Value error, ") for d in long_title.json()["detail"])
