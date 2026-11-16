"""
Etap 7 -- matrica dostupa (4 roli x 3 tipa laby) dlya Worldview (Wv).
Pattern identichen test_lab_access_matrix_observation.py / _hypothesis.py / _prediction.py / _task.py / _question.py.
"""
import pytest
from tests.conftest import create_test_user, add_lab_member
from datetime import date


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


async def _create_wv(client, lab_id=None, visibility="private", belief="Test belief"):
    r = await client.post("/api/v1/worldview/", json={
        "date": date.today().isoformat(), "belief": belief,
        "lab_id": lab_id, "visibility": visibility,
    })
    assert r.status_code == 201, r.text
    return r.json()


# --- Privatnaya laba ---

@pytest.mark.asyncio
async def test_private_lab_owner_can_create_and_read(client):
    await create_test_user("wsl_owner1")
    await _login(client, "wsl_owner1")
    lab = await _create_lab(client, "Private WA1", is_public=False)
    wv = await _create_wv(client, lab_id=lab["id"], visibility="lab")
    r = await client.get(f"/api/v1/worldview/{wv['id']}")
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_private_lab_member_can_read(client):
    await create_test_user("wsl_owner2")
    member = await create_test_user("wsl_member2")
    await _login(client, "wsl_owner2")
    lab = await _create_lab(client, "Private WA2", is_public=False)
    wv = await _create_wv(client, lab_id=lab["id"], visibility="lab")
    await add_lab_member(lab["id"], member.id)

    await _login(client, "wsl_member2")
    r = await client.get(f"/api/v1/worldview/{wv['id']}")
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_private_lab_outsider_cannot_read(client):
    await create_test_user("wsl_owner3")
    await create_test_user("wsl_outsider3")
    await _login(client, "wsl_owner3")
    lab = await _create_lab(client, "Private WA3", is_public=False)
    wv = await _create_wv(client, lab_id=lab["id"], visibility="lab")

    await _login(client, "wsl_outsider3")
    r = await client.get(f"/api/v1/worldview/{wv['id']}")
    assert r.status_code in (403, 404)


@pytest.mark.asyncio
async def test_private_lab_outsider_cannot_create(client):
    await create_test_user("wsl_owner4")
    await create_test_user("wsl_outsider4")
    await _login(client, "wsl_owner4")
    lab = await _create_lab(client, "Private WA4", is_public=False)

    await _login(client, "wsl_outsider4")
    r = await client.post("/api/v1/worldview/", json={
        "date": date.today().isoformat(), "belief": "Injected",
        "lab_id": lab["id"], "visibility": "lab",
    })
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_private_lab_admin_can_read(client):
    await create_test_user("wsl_owner5")
    admin = await create_test_user("wsl_admin5")
    await _login(client, "wsl_owner5")
    lab = await _create_lab(client, "Private WA5", is_public=False)
    wv = await _create_wv(client, lab_id=lab["id"], visibility="lab")
    await add_lab_member(lab["id"], admin.id, role="admin")

    await _login(client, "wsl_admin5")
    r = await client.get(f"/api/v1/worldview/{wv['id']}")
    assert r.status_code == 200


# --- Publichnaya laba, otkrytoe vstuplenie ---

@pytest.mark.asyncio
async def test_public_open_lab_outsider_can_read(client):
    await create_test_user("wso_owner1")
    await create_test_user("wso_outsider1")
    await _login(client, "wso_owner1")
    lab = await _create_lab(client, "Public Open WB1", is_public=True, open_join=True)
    wv = await _create_wv(client, lab_id=lab["id"], visibility="lab")

    await _login(client, "wso_outsider1")
    r = await client.get(f"/api/v1/worldview/{wv['id']}")
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_public_open_lab_outsider_cannot_create_without_joining(client):
    await create_test_user("wso_owner2")
    await create_test_user("wso_outsider2")
    await _login(client, "wso_owner2")
    lab = await _create_lab(client, "Public Open WB2", is_public=True, open_join=True)

    await _login(client, "wso_outsider2")
    r = await client.post("/api/v1/worldview/", json={
        "date": date.today().isoformat(), "belief": "Injected",
        "lab_id": lab["id"], "visibility": "lab",
    })
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_public_open_lab_member_can_create(client):
    await create_test_user("wso_owner3")
    member = await create_test_user("wso_member3")
    await _login(client, "wso_owner3")
    lab = await _create_lab(client, "Public Open WB3", is_public=True, open_join=True)
    await add_lab_member(lab["id"], member.id)

    await _login(client, "wso_member3")
    r = await client.post("/api/v1/worldview/", json={
        "date": date.today().isoformat(), "belief": "Legit",
        "lab_id": lab["id"], "visibility": "lab",
    })
    assert r.status_code == 201, r.text


# --- Publichnaya laba, vstuplenie po zayavke ---

@pytest.mark.asyncio
async def test_public_approval_lab_outsider_can_read(client):
    await create_test_user("wsa_owner1")
    await create_test_user("wsa_outsider1")
    await _login(client, "wsa_owner1")
    lab = await _create_lab(client, "Public Approval WC1", is_public=True, open_join=False)
    wv = await _create_wv(client, lab_id=lab["id"], visibility="lab")

    await _login(client, "wsa_outsider1")
    r = await client.get(f"/api/v1/worldview/{wv['id']}")
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_public_approval_lab_join_request_flow(client):
    await create_test_user("wsa_owner2")
    await create_test_user("wsa_applicant2")
    await _login(client, "wsa_owner2")
    lab = await _create_lab(client, "Public Approval WC2", is_public=True, open_join=False)

    await _login(client, "wsa_applicant2")
    r = await client.post(f"/api/v1/labs/{lab['id']}/join-request", json={"message": "let me in"})
    assert r.status_code in (200, 201), r.text

    r = await client.post("/api/v1/worldview/", json={
        "date": date.today().isoformat(), "belief": "Too early",
        "lab_id": lab["id"], "visibility": "lab",
    })
    assert r.status_code == 403

    await _login(client, "wsa_owner2")
    r = await client.get(f"/api/v1/labs/{lab['id']}/requests")
    assert r.status_code == 200, r.text
    req_id = r.json()[0]["id"]
    r = await client.post(f"/api/v1/labs/{lab['id']}/requests/{req_id}/accept")
    assert r.status_code in (200, 204), r.text

    await _login(client, "wsa_applicant2")
    r = await client.post("/api/v1/worldview/", json={
        "date": date.today().isoformat(), "belief": "Now allowed",
        "lab_id": lab["id"], "visibility": "lab",
    })
    assert r.status_code == 201, r.text


@pytest.mark.asyncio
async def test_public_approval_lab_outsider_cannot_create_without_request(client):
    await create_test_user("wsa_owner3")
    await create_test_user("wsa_outsider3")
    await _login(client, "wsa_owner3")
    lab = await _create_lab(client, "Public Approval WC3", is_public=True, open_join=False)

    await _login(client, "wsa_outsider3")
    r = await client.post("/api/v1/worldview/", json={
        "date": date.today().isoformat(), "belief": "Injected",
        "lab_id": lab["id"], "visibility": "lab",
    })
    assert r.status_code == 403
