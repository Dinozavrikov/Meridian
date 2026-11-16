"""
Этап 7 — систематическая матрица доступа для Observation.
4 роли (owner/admin/member/outsider) x 3 типа лабы (private/public-open/public-approval).
Эталонный файл — паттерн тиражируется на остальные 6 типов сущностей после ревью.
"""
import pytest
from tests.conftest import create_test_user, add_lab_member


async def _login(client, username, password="pass12345"):
    r = await client.post("/api/v1/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200


async def _create_lab(client, name, is_public=False, open_join=False):
    r = await client.post("/api/v1/labs", json={
        "name": name, "is_public": is_public, "open_join": open_join,
        "goal_type": "task", "new_goal_title": f"Goal for {name}",
    })
    assert r.status_code == 200, r.text
    return r.json()


async def _create_obs(client, lab_id=None, visibility="private", title="Test obs"):
    r = await client.post("/api/v1/observations/", json={
        "title": title, "date": "2026-08-15", "author": "tester", "text": "obs body",
        "lab_id": lab_id, "visibility": visibility,
    })
    assert r.status_code == 201, r.text
    return r.json()


# --- Приватная лаба ---

@pytest.mark.asyncio
async def test_private_lab_owner_can_create_and_read(client):
    owner = await create_test_user("pl_owner1")
    await _login(client, "pl_owner1")
    lab = await _create_lab(client, "Private A1", is_public=False)
    obs = await _create_obs(client, lab_id=lab["id"], visibility="lab")
    r = await client.get(f"/api/v1/observations/{obs['id']}")
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_private_lab_member_can_read_lab_observation(client):
    owner = await create_test_user("pl_owner2")
    member = await create_test_user("pl_member2")
    await _login(client, "pl_owner2")
    lab = await _create_lab(client, "Private A2", is_public=False)
    obs = await _create_obs(client, lab_id=lab["id"], visibility="lab")
    await add_lab_member(lab["id"], member.id)

    await _login(client, "pl_member2")
    r = await client.get(f"/api/v1/observations/{obs['id']}")
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_private_lab_outsider_cannot_read(client):
    owner = await create_test_user("pl_owner3")
    outsider = await create_test_user("pl_outsider3")
    await _login(client, "pl_owner3")
    lab = await _create_lab(client, "Private A3", is_public=False)
    obs = await _create_obs(client, lab_id=lab["id"], visibility="lab")

    await _login(client, "pl_outsider3")
    r = await client.get(f"/api/v1/observations/{obs['id']}")
    assert r.status_code in (403, 404)


@pytest.mark.asyncio
async def test_private_lab_outsider_cannot_create(client):
    owner = await create_test_user("pl_owner4")
    outsider = await create_test_user("pl_outsider4")
    await _login(client, "pl_owner4")
    lab = await _create_lab(client, "Private A4", is_public=False)

    await _login(client, "pl_outsider4")
    r = await client.post("/api/v1/observations/", json={
        "title": "Injected", "date": "2026-08-15", "author": "attacker", "text": "x",
        "lab_id": lab["id"], "visibility": "lab",
    })
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_private_lab_admin_can_read(client):
    owner = await create_test_user("pl_owner5")
    admin = await create_test_user("pl_admin5")
    await _login(client, "pl_owner5")
    lab = await _create_lab(client, "Private A5", is_public=False)
    obs = await _create_obs(client, lab_id=lab["id"], visibility="lab")
    await add_lab_member(lab["id"], admin.id, role="admin")

    await _login(client, "pl_admin5")
    r = await client.get(f"/api/v1/observations/{obs['id']}")
    assert r.status_code == 200


# --- Публичная лаба, открытое вступление ---

@pytest.mark.asyncio
async def test_public_open_lab_outsider_can_read_lab_observation(client):
    owner = await create_test_user("po_owner1")
    outsider = await create_test_user("po_outsider1")
    await _login(client, "po_owner1")
    lab = await _create_lab(client, "Public Open B1", is_public=True, open_join=True)
    obs = await _create_obs(client, lab_id=lab["id"], visibility="lab")

    await _login(client, "po_outsider1")
    r = await client.get(f"/api/v1/observations/{obs['id']}")
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_public_open_lab_outsider_cannot_create_without_joining(client):
    owner = await create_test_user("po_owner2")
    outsider = await create_test_user("po_outsider2")
    await _login(client, "po_owner2")
    lab = await _create_lab(client, "Public Open B2", is_public=True, open_join=True)

    await _login(client, "po_outsider2")
    r = await client.post("/api/v1/observations/", json={
        "title": "Injected", "date": "2026-08-15", "author": "attacker", "text": "x",
        "lab_id": lab["id"], "visibility": "lab",
    })
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_public_open_lab_member_can_create(client):
    owner = await create_test_user("po_owner3")
    member = await create_test_user("po_member3")
    await _login(client, "po_owner3")
    lab = await _create_lab(client, "Public Open B3", is_public=True, open_join=True)
    await add_lab_member(lab["id"], member.id)

    await _login(client, "po_member3")
    r = await client.post("/api/v1/observations/", json={
        "title": "Legit", "date": "2026-08-15", "author": "member", "text": "x",
        "lab_id": lab["id"], "visibility": "lab",
    })
    assert r.status_code == 201, r.text


# --- Публичная лаба, вступление по заявке ---

@pytest.mark.asyncio
async def test_public_approval_lab_outsider_can_read_lab_observation(client):
    owner = await create_test_user("pa_owner1")
    outsider = await create_test_user("pa_outsider1")
    await _login(client, "pa_owner1")
    lab = await _create_lab(client, "Public Approval C1", is_public=True, open_join=False)
    obs = await _create_obs(client, lab_id=lab["id"], visibility="lab")

    await _login(client, "pa_outsider1")
    r = await client.get(f"/api/v1/observations/{obs['id']}")
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_public_approval_lab_join_request_flow(client):
    owner = await create_test_user("pa_owner2")
    applicant = await create_test_user("pa_applicant2")
    await _login(client, "pa_owner2")
    lab = await _create_lab(client, "Public Approval C2", is_public=True, open_join=False)

    await _login(client, "pa_applicant2")
    r = await client.post(f"/api/v1/labs/{lab['id']}/join-request", json={"message": "let me in"})
    assert r.status_code in (200, 201), r.text

    # заявитель ещё не участник — не может писать
    r = await client.post("/api/v1/observations/", json={
        "title": "Too early", "date": "2026-08-15", "author": "applicant", "text": "x",
        "lab_id": lab["id"], "visibility": "lab",
    })
    assert r.status_code == 403

    await _login(client, "pa_owner2")
    r = await client.get(f"/api/v1/labs/{lab['id']}/requests")
    assert r.status_code == 200, r.text
    requests = r.json()
    assert len(requests) == 1
    req_id = requests[0]["id"]

    r = await client.post(f"/api/v1/labs/{lab['id']}/requests/{req_id}/accept")
    assert r.status_code in (200, 204), r.text

    await _login(client, "pa_applicant2")
    r = await client.post("/api/v1/observations/", json={
        "title": "Now allowed", "date": "2026-08-15", "author": "applicant", "text": "x",
        "lab_id": lab["id"], "visibility": "lab",
    })
    assert r.status_code == 201, r.text


@pytest.mark.asyncio
async def test_public_approval_lab_outsider_cannot_create_without_request(client):
    owner = await create_test_user("pa_owner3")
    outsider = await create_test_user("pa_outsider3")
    await _login(client, "pa_owner3")
    lab = await _create_lab(client, "Public Approval C3", is_public=True, open_join=False)

    await _login(client, "pa_outsider3")
    r = await client.post("/api/v1/observations/", json={
        "title": "Injected", "date": "2026-08-15", "author": "attacker", "text": "x",
        "lab_id": lab["id"], "visibility": "lab",
    })
    assert r.status_code == 403
