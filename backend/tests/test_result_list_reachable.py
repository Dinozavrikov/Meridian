"""Список результатов не должен показывать то, что get_result не отдаёт: приватный результат чужой лаборатории,
связанный (Link) с записью лаборатории зрителя, раньше попадал в GET /results/ через канал reachable."""
import pytest
from tests.conftest import create_test_user
from app.db.session import AsyncSessionLocal
from app.models.entities import Link


async def _login(client, username, password="pass12345"):
    r = await client.post("/api/v1/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200


async def _lab(client, name):
    r = await client.post("/api/v1/labs", json={"name": name, "is_public": False, "goal_type": "task", "new_goal_title": f"G {name}"})
    assert r.status_code == 200, r.text
    return r.json()["id"]


@pytest.mark.asyncio
async def test_private_result_linked_to_viewers_lab_entity_is_not_listed(client):
    owner = await create_test_user("rl_owner")
    viewer = await create_test_user("rl_viewer")
    await _login(client, "rl_owner")
    lab_a = await _lab(client, "Lab A rl")
    r = await client.post("/api/v1/results/", json={"title": "Секретный результат", "body": "тело", "lab_id": lab_a, "visibility": "private"})
    assert r.status_code == 201, r.text
    rid = r.json()["id"]

    await _login(client, "rl_viewer")
    lab_b = await _lab(client, "Lab B rl")
    p = await client.post("/api/v1/predictions/", json={"title": "p", "text": "t", "date_created": "2026-08-06",
        "expected_check_date": "2026-12-06T00:00:00", "status": "не проверен", "visibility": "lab", "lab_id": lab_b, "confidence": 50})
    assert p.status_code in (200, 201), p.text
    pid = p.json()["id"]
    async with AsyncSessionLocal() as db:
        db.add(Link(user_id=viewer.id, from_type="prediction", from_id=pid, to_type="result", to_id=rid, link_type="связано"))
        await db.commit()

    assert (await client.get(f"/api/v1/results/{rid}")).status_code in (403, 404)   # деталь закрыта
    listed = (await client.get("/api/v1/results/")).json()
    assert rid not in [x["id"] for x in listed], "приватный результат чужой лаборатории виден в списке"


@pytest.mark.asyncio
async def test_member_does_not_see_private_draft_in_list(client):
    await create_test_user("rm_owner")
    member = await create_test_user("rm_member")
    await _login(client, "rm_owner")
    lab = await _lab(client, "Lab rm")
    r = await client.post("/api/v1/results/", json={"title": "Черновик", "body": "тело", "lab_id": lab, "visibility": "private"})
    assert r.status_code == 201, r.text
    rid = r.json()["id"]
    from tests.conftest import add_lab_member
    await add_lab_member(lab, member.id, role="member")

    await _login(client, "rm_member")
    assert (await client.get(f"/api/v1/results/{rid}")).status_code in (403, 404)   # деталь закрыта
    listed = (await client.get("/api/v1/results/")).json()
    assert rid not in [x["id"] for x in listed], "приватный черновик виден участнику лаборатории в списке"
