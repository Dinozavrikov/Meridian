"""GET /{type}/{id}/preview: доступ как у просмотра записи, содержимое без HTML, показатели и теги."""
from sqlalchemy import update

from app.db.session import AsyncSessionLocal
from app.models.entities import Observation
from tests.conftest import create_test_user


async def _login(client, username, password="pass12345"):
    r = await client.post("/api/v1/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200


async def _obs(client, visibility="private", text="<p>Привет <b>мир</b></p>"):
    r = await client.post("/api/v1/observations/", json={"title": "Заголовок", "date": "2026-09-23", "author": "a", "text": text,
                                                         "lab_id": None, "visibility": visibility, "tags": ["alpha"]})
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def test_owner_sees_everything_without_html(client):
    await create_test_user("pv_a")
    await _login(client, "pv_a")
    oid = await _obs(client)
    r = await client.get(f"/api/v1/observation/{oid}/preview")
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["title"] == "Заголовок" and d["excerpt"] == "Привет мир" and d["tags"] == ["alpha"]
    assert d["is_owner"] is True and d["visibility"] == "private" and d["author"]["username"] == "pv_a"
    assert d["links_count"] == 0


async def test_stranger_and_guest_get_404_on_private(client):
    await create_test_user("pv_b")
    await create_test_user("pv_c")
    await _login(client, "pv_b")
    oid = await _obs(client)
    await _login(client, "pv_c")
    assert (await client.get(f"/api/v1/observation/{oid}/preview")).status_code == 404
    client.cookies.clear()
    assert (await client.get(f"/api/v1/observation/{oid}/preview")).status_code == 404


async def test_public_is_visible_to_guest_but_not_owner_flag(client):
    await create_test_user("pv_d")
    await _login(client, "pv_d")
    oid = await _obs(client, visibility="public")
    client.cookies.clear()
    r = await client.get(f"/api/v1/observation/{oid}/preview")
    assert r.status_code == 200 and r.json()["is_owner"] is False


async def test_trashed_and_unknown_type_are_404(client):
    await create_test_user("pv_e")
    await _login(client, "pv_e")
    oid = await _obs(client)
    async with AsyncSessionLocal() as db:
        await db.execute(update(Observation).where(Observation.id == oid).values(deleted_at=Observation.created_at))
        await db.commit()
    assert (await client.get(f"/api/v1/observation/{oid}/preview")).status_code == 404
    assert (await client.get("/api/v1/lab/1/preview")).status_code == 404


async def test_prediction_metrics_and_links_count(client):
    await create_test_user("pv_f")
    await _login(client, "pv_f")
    p = (await client.post("/api/v1/predictions/", json={"title": "p", "text": "will", "date_created": "2026-08-06",
         "expected_check_date": "2026-09-06T00:00:00", "status": "не проверен", "visibility": "private", "confidence": 70})).json()["id"]
    o = await _obs(client)
    await client.post(f"/api/v1/graph/links?from_type=observation&from_id={o}&to_type=prediction&to_id={p}&link_type=связано")
    d = (await client.get(f"/api/v1/prediction/{p}/preview")).json()
    m = {x["key"]: x["value"] for x in d["metrics"]}
    assert m["confidence"] == 70 and "expected_check_date" in m
    assert d["links_count"] == 1 and d["status"] == "не проверен"
