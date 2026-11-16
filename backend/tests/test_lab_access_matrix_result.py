"""
Etap 7 -- dopolnitelnaya matrica dostupa dlya Result.
test_result_access.py uzhe pokryvaet suggest/accept/publish/unpublish
i vneshnyuyu vidimost (is_published gate). Etot fayl zakryvaet probely:
bazovoe chtenie vnutri laby dlya owner/member/admin, i creation gate
po rolyam (member/outsider v public-open i public-approval labah) --
ni to ni drugoe v test_result_access.py ne pokryto.
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


async def _create_result(client, lab_id, visibility="lab", title="Test result"):
    r = await client.post("/api/v1/results/", json={
        "title": title, "body": "body text", "lab_id": lab_id, "visibility": visibility,
    })
    assert r.status_code == 201, r.text
    return r.json()


# --- Bazovoe chtenie vnutri privatnoy laby ---

@pytest.mark.asyncio
async def test_private_lab_owner_can_read(client):
    await create_test_user("rsl_owner1")
    await _login(client, "rsl_owner1")
    lab = await _create_lab(client, "Private RA1", is_public=False)
    res = await _create_result(client, lab["id"], visibility="lab")
    r = await client.get(f"/api/v1/results/{res['id']}")
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_private_lab_member_can_read(client):
    await create_test_user("rsl_owner2")
    member = await create_test_user("rsl_member2")
    await _login(client, "rsl_owner2")
    lab = await _create_lab(client, "Private RA2", is_public=False)
    res = await _create_result(client, lab["id"], visibility="lab")
    await add_lab_member(lab["id"], member.id)

    await _login(client, "rsl_member2")
    r = await client.get(f"/api/v1/results/{res['id']}")
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_private_lab_admin_can_read(client):
    await create_test_user("rsl_owner3")
    admin = await create_test_user("rsl_admin3")
    await _login(client, "rsl_owner3")
    lab = await _create_lab(client, "Private RA3", is_public=False)
    res = await _create_result(client, lab["id"], visibility="lab")
    await add_lab_member(lab["id"], admin.id, role="admin")

    await _login(client, "rsl_admin3")
    r = await client.get(f"/api/v1/results/{res['id']}")
    assert r.status_code == 200


# --- Creation gate: publichnaya laba, otkrytoe vstuplenie ---

@pytest.mark.asyncio
async def test_public_open_lab_outsider_cannot_create_without_joining(client):
    await create_test_user("rso_owner1")
    await create_test_user("rso_outsider1")
    await _login(client, "rso_owner1")
    lab = await _create_lab(client, "Public Open RB1", is_public=True, open_join=True)

    await _login(client, "rso_outsider1")
    r = await client.post("/api/v1/results/", json={
        "title": "Injected", "body": "x", "lab_id": lab["id"], "visibility": "lab",
    })
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_public_open_lab_member_can_create(client):
    await create_test_user("rso_owner2")
    member = await create_test_user("rso_member2")
    await _login(client, "rso_owner2")
    lab = await _create_lab(client, "Public Open RB2", is_public=True, open_join=True)
    await add_lab_member(lab["id"], member.id)

    await _login(client, "rso_member2")
    r = await client.post("/api/v1/results/", json={
        "title": "Legit", "body": "x", "lab_id": lab["id"], "visibility": "lab",
    })
    assert r.status_code == 201, r.text


# --- Creation gate: publichnaya laba, vstuplenie po zayavke ---

@pytest.mark.asyncio
async def test_public_approval_lab_join_request_flow(client):
    await create_test_user("rsa_owner1")
    await create_test_user("rsa_applicant1")
    await _login(client, "rsa_owner1")
    lab = await _create_lab(client, "Public Approval RC1", is_public=True, open_join=False)

    await _login(client, "rsa_applicant1")
    r = await client.post(f"/api/v1/labs/{lab['id']}/join-request", json={"message": "let me in"})
    assert r.status_code in (200, 201), r.text

    r = await client.post("/api/v1/results/", json={
        "title": "Too early", "body": "x", "lab_id": lab["id"], "visibility": "lab",
    })
    assert r.status_code == 403

    await _login(client, "rsa_owner1")
    r = await client.get(f"/api/v1/labs/{lab['id']}/requests")
    assert r.status_code == 200, r.text
    req_id = r.json()[0]["id"]
    r = await client.post(f"/api/v1/labs/{lab['id']}/requests/{req_id}/accept")
    assert r.status_code in (200, 204), r.text

    await _login(client, "rsa_applicant1")
    r = await client.post("/api/v1/results/", json={
        "title": "Now allowed", "body": "x", "lab_id": lab["id"], "visibility": "lab",
    })
    assert r.status_code == 201, r.text
