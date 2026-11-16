"""PUT /{type}/{id}/visibility: меняет только автор, поля пишутся в БД, текст записи не трогается."""
import pytest

from app.core.entity_registry import ENTITY_MODELS
from app.db.session import AsyncSessionLocal
from tests.conftest import create_test_user

CREATE = {
    "observation": ("/api/v1/observations/", {"title": "t", "date": "2026-09-23", "author": "tester", "text": "body", "lab_id": None, "visibility": "private"}),
    "hypothesis": ("/api/v1/hypotheses/", {"name": "h", "description": "d", "date_created": "2026-08-06", "status": "идея", "visibility": "private"}),
    "question": ("/api/v1/questions/", {"title": "q", "date_created": "2026-08-06", "status": "открыт", "visibility": "private"}),
    "prediction": ("/api/v1/predictions/", {"title": "p", "text": "will", "date_created": "2026-08-06", "expected_check_date": "2026-09-06T00:00:00", "status": "не проверен", "visibility": "private"}),
    "worldview": ("/api/v1/worldview/", {"date": "2026-08-06", "belief": "b", "visibility": "private"}),
}
TYPES = list(CREATE)


async def _login(client, username, password="pass12345"):
    r = await client.post("/api/v1/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200


async def _create(client, etype):
    url, body = CREATE[etype]
    r = await client.post(url, json=body)
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


async def _row(etype, eid):
    async with AsyncSessionLocal() as db:
        obj = await db.get(ENTITY_MODELS[etype], eid)
        return obj.visibility, obj.lab_id


@pytest.mark.parametrize("etype", TYPES)
async def test_owner_changes_visibility_in_db(client, etype):
    await create_test_user("vis_owner")
    await _login(client, "vis_owner")
    eid = await _create(client, etype)
    r = await client.put(f"/api/v1/{etype}/{eid}/visibility", json={"visibility": "public"})
    assert r.status_code == 200, r.text
    assert await _row(etype, eid) == ("public", None)


@pytest.mark.parametrize("etype", TYPES)
async def test_stranger_cannot_change_visibility(client, etype):
    await create_test_user("vis_owner2")
    await create_test_user("vis_stranger")
    await _login(client, "vis_owner2")
    eid = await _create(client, etype)
    await _login(client, "vis_stranger")
    r = await client.put(f"/api/v1/{etype}/{eid}/visibility", json={"visibility": "public"})
    assert r.status_code == 403
    assert await _row(etype, eid) == ("private", None)


async def test_lab_without_lab_id_rejected(client):
    await create_test_user("vis_owner3")
    await _login(client, "vis_owner3")
    eid = await _create(client, "observation")
    r = await client.put(f"/api/v1/observation/{eid}/visibility", json={"visibility": "lab"})
    assert r.status_code == 400
    assert await _row("observation", eid) == ("private", None)


async def test_private_detaches_lab_and_text_is_untouched(client):
    await create_test_user("vis_owner4")
    await _login(client, "vis_owner4")
    lab = (await client.post("/api/v1/labs", json={
        "name": "L", "is_public": False, "open_join": False, "goal_type": "task", "new_goal_title": "G",
    })).json()
    eid = await _create(client, "observation")
    r = await client.put(f"/api/v1/observation/{eid}/visibility", json={"visibility": "lab", "lab_id": lab["id"]})
    assert r.status_code == 200, r.text
    assert (await _row("observation", eid))[1] == lab["id"]
    r = await client.put(f"/api/v1/observation/{eid}/visibility", json={"visibility": "private", "lab_id": lab["id"]})
    assert r.status_code == 200, r.text
    assert await _row("observation", eid) == ("private", None)
    async with AsyncSessionLocal() as db:
        assert (await db.get(ENTITY_MODELS["observation"], eid)).text == "body"


async def test_unknown_type_404(client):
    await create_test_user("vis_owner5")
    await _login(client, "vis_owner5")
    r = await client.put("/api/v1/lab/1/visibility", json={"visibility": "public"})
    assert r.status_code == 404
