"""
Этап 7 — матрица доступа (4 роли x 3 типа лабы) для Prediction.
Паттерн идентичен test_lab_access_matrix_observation.py / _hypothesis.py.
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


async def _create_pred(client, lab_id=None, visibility="private", text="Test prediction"):
    r = await client.post("/api/v1/predictions/", json={
        "text": text, "date_created": "2026-08-15",
        "expected_check_date": "2026-12-31T00:00:00",
        "lab_id": lab_id, "visibility": visibility,
    })
    assert r.status_code == 201, r.text
    return r.json()


# --- Приватная лаба ---

@pytest.mark.asyncio
async def test_private_lab_owner_can_create_and_read(client):
    await create_test_user("prl_owner1")
    await _login(client, "prl_owner1")
    lab = await _create_lab(client, "Private PA1", is_public=False)
    pred = await _create_pred(client, lab_id=lab["id"], visibility="lab")
    r = await client.get(f"/api/v1/predictions/{pred['id']}")
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_private_lab_member_can_read(client):
    await create_test_user("prl_owner2")
    member = await create_test_user("prl_member2")
    await _login(client, "prl_owner2")
    lab = await _create_lab(client, "Private PA2", is_public=False)
    pred = await _create_pred(client, lab_id=lab["id"], visibility="lab")
    await add_lab_member(lab["id"], member.id)

    await _login(client, "prl_member2")
    r = await client.get(f"/api/v1/predictions/{pred['id']}")
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_private_lab_outsider_cannot_read(client):
    await create_test_user("prl_owner3")
    await create_test_user("prl_outsider3")
    await _login(client, "prl_owner3")
    lab = await _create_lab(client, "Private PA3", is_public=False)
    pred = await _create_pred(client, lab_id=lab["id"], visibility="lab")

    await _login(client, "prl_outsider3")
    r = await client.get(f"/api/v1/predictions/{pred['id']}")
    assert r.status_code in (403, 404)


@pytest.mark.asyncio
async def test_private_lab_outsider_cannot_create(client):
    await create_test_user("prl_owner4")
    await create_test_user("prl_outsider4")
    await _login(client, "prl_owner4")
    lab = await _create_lab(client, "Private PA4", is_public=False)

    await _login(client, "prl_outsider4")
    r = await client.post("/api/v1/predictions/", json={
        "text": "Injected", "date_created": "2026-08-15",
        "expected_check_date": "2026-12-31T00:00:00",
        "lab_id": lab["id"], "visibility": "lab",
    })
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_private_lab_admin_can_read(client):
    await create_test_user("prl_owner5")
    admin = await create_test_user("prl_admin5")
    await _login(client, "prl_owner5")
    lab = await _create_lab(client, "Private PA5", is_public=False)
    pred = await _create_pred(client, lab_id=lab["id"], visibility="lab")
    await add_lab_member(lab["id"], admin.id, role="admin")

    await _login(client, "prl_admin5")
    r = await client.get(f"/api/v1/predictions/{pred['id']}")
    assert r.status_code == 200


# --- Публичная лаба, открытое вступление ---

@pytest.mark.asyncio
async def test_public_open_lab_outsider_can_read(client):
    await create_test_user("pro_owner1")
    await create_test_user("pro_outsider1")
    await _login(client, "pro_owner1")
    lab = await _create_lab(client, "Public Open PB1", is_public=True, open_join=True)
    pred = await _create_pred(client, lab_id=lab["id"], visibility="lab")

    await _login(client, "pro_outsider1")
    r = await client.get(f"/api/v1/predictions/{pred['id']}")
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_public_open_lab_outsider_cannot_create_without_joining(client):
    await create_test_user("pro_owner2")
    await create_test_user("pro_outsider2")
    await _login(client, "pro_owner2")
    lab = await _create_lab(client, "Public Open PB2", is_public=True, open_join=True)

    await _login(client, "pro_outsider2")
    r = await client.post("/api/v1/predictions/", json={
        "text": "Injected", "date_created": "2026-08-15",
        "expected_check_date": "2026-12-31T00:00:00",
        "lab_id": lab["id"], "visibility": "lab",
    })
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_public_open_lab_member_can_create(client):
    await create_test_user("pro_owner3")
    member = await create_test_user("pro_member3")
    await _login(client, "pro_owner3")
    lab = await _create_lab(client, "Public Open PB3", is_public=True, open_join=True)
    await add_lab_member(lab["id"], member.id)

    await _login(client, "pro_member3")
    r = await client.post("/api/v1/predictions/", json={
        "text": "Legit", "date_created": "2026-08-15",
        "expected_check_date": "2026-12-31T00:00:00",
        "lab_id": lab["id"], "visibility": "lab",
    })
    assert r.status_code == 201, r.text


# --- Публичная лаба, вступление по заявке ---

@pytest.mark.asyncio
async def test_public_approval_lab_outsider_can_read(client):
    await create_test_user("pra_owner1")
    await create_test_user("pra_outsider1")
    await _login(client, "pra_owner1")
    lab = await _create_lab(client, "Public Approval PC1", is_public=True, open_join=False)
    pred = await _create_pred(client, lab_id=lab["id"], visibility="lab")

    await _login(client, "pra_outsider1")
    r = await client.get(f"/api/v1/predictions/{pred['id']}")
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_public_approval_lab_join_request_flow(client):
    await create_test_user("pra_owner2")
    await create_test_user("pra_applicant2")
    await _login(client, "pra_owner2")
    lab = await _create_lab(client, "Public Approval PC2", is_public=True, open_join=False)

    await _login(client, "pra_applicant2")
    r = await client.post(f"/api/v1/labs/{lab['id']}/join-request", json={"message": "let me in"})
    assert r.status_code in (200, 201), r.text

    r = await client.post("/api/v1/predictions/", json={
        "text": "Too early", "date_created": "2026-08-15",
        "expected_check_date": "2026-12-31T00:00:00",
        "lab_id": lab["id"], "visibility": "lab",
    })
    assert r.status_code == 403

    await _login(client, "pra_owner2")
    r = await client.get(f"/api/v1/labs/{lab['id']}/requests")
    assert r.status_code == 200, r.text
    req_id = r.json()[0]["id"]
    r = await client.post(f"/api/v1/labs/{lab['id']}/requests/{req_id}/accept")
    assert r.status_code in (200, 204), r.text

    await _login(client, "pra_applicant2")
    r = await client.post("/api/v1/predictions/", json={
        "text": "Now allowed", "date_created": "2026-08-15",
        "expected_check_date": "2026-12-31T00:00:00",
        "lab_id": lab["id"], "visibility": "lab",
    })
    assert r.status_code == 201, r.text


@pytest.mark.asyncio
async def test_public_approval_lab_outsider_cannot_create_without_request(client):
    await create_test_user("pra_owner3")
    await create_test_user("pra_outsider3")
    await _login(client, "pra_owner3")
    lab = await _create_lab(client, "Public Approval PC3", is_public=True, open_join=False)

    await _login(client, "pra_outsider3")
    r = await client.post("/api/v1/predictions/", json={
        "text": "Injected", "date_created": "2026-08-15",
        "expected_check_date": "2026-12-31T00:00:00",
        "lab_id": lab["id"], "visibility": "lab",
    })
    assert r.status_code == 403
