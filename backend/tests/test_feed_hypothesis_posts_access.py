"""
IDOR-тест для POST /api/v1/feed/hypothesis/{hyp_id}/posts.
Баг: create_post проверял только visibility=="private", но не visibility=="lab",
в отличие от соседнего get_posts (у которого обе ветки были). Не-участник лабы
мог написать пост на чужую лабовскую гипотезу. Исправлено в feed.py.
"""
import pytest
from tests.conftest import create_test_user, add_lab_member


async def _login(client, username, password="pass12345"):
    r = await client.post("/api/v1/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200


async def _create_lab(client, name, is_public=False):
    r = await client.post("/api/v1/labs", json={
        "name": name, "is_public": is_public,
        "goal_type": "task", "new_goal_title": f"Goal for {name}",
    })
    assert r.status_code == 200, r.text
    return r.json()


async def _create_hyp(client, lab_id=None, visibility="private", name="Test hyp"):
    r = await client.post("/api/v1/hypotheses/", json={
        "name": name, "date_created": "2026-08-15",
        "lab_id": lab_id, "visibility": visibility,
    })
    assert r.status_code == 201, r.text
    return r.json()


@pytest.mark.asyncio
async def test_non_member_cannot_post_to_lab_hypothesis(client):
    owner = await create_test_user("hp_owner1")
    attacker = await create_test_user("hp_attacker1")
    await _login(client, "hp_owner1")
    lab = await _create_lab(client, "Private Lab HP1", is_public=False)
    hyp = await _create_hyp(client, lab_id=lab["id"], visibility="lab", name="Lab hyp 1")

    await _login(client, "hp_attacker1")
    r = await client.post(f"/api/v1/feed/hypothesis/{hyp['id']}/posts", json={
        "title": "Injected", "content": "attacker content",
    })
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_member_can_post_to_lab_hypothesis(client):
    owner = await create_test_user("hp_owner2")
    member = await create_test_user("hp_member2")
    await _login(client, "hp_owner2")
    lab = await _create_lab(client, "Private Lab HP2", is_public=False)
    hyp = await _create_hyp(client, lab_id=lab["id"], visibility="lab", name="Lab hyp 2")
    await add_lab_member(lab["id"], member.id)

    await _login(client, "hp_member2")
    r = await client.post(f"/api/v1/feed/hypothesis/{hyp['id']}/posts", json={
        "title": "Legit", "content": "member content",
    })
    assert r.status_code == 200, r.text


@pytest.mark.asyncio
async def test_outsider_cannot_post_to_private_hypothesis(client):
    owner = await create_test_user("hp_owner3")
    outsider = await create_test_user("hp_outsider3")
    await _login(client, "hp_owner3")
    hyp = await _create_hyp(client, lab_id=None, visibility="private", name="Private hyp 3")

    await _login(client, "hp_outsider3")
    r = await client.post(f"/api/v1/feed/hypothesis/{hyp['id']}/posts", json={
        "title": "Injected", "content": "outsider content",
    })
    assert r.status_code == 403
