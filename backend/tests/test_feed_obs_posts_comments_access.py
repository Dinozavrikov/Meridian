"""
IDOR-тесты для feed.py:
1. create_obs_post — не проверял visibility наблюдения вообще (ни private, ни lab).
2. get_comments/create_comment — не проверяли доступ к родительскому посту/гипотезе вообще.
Исправлено в feed.py той же сессией, что и create_post для гипотез.
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


async def _create_obs(client, lab_id=None, visibility="private", title="Test obs"):
    r = await client.post("/api/v1/observations/", json={
        "title": title, "date": "2026-08-15", "author": "tester", "text": "obs body",
        "lab_id": lab_id, "visibility": visibility,
    })
    assert r.status_code == 201, r.text
    return r.json()


async def _create_hyp(client, lab_id=None, visibility="private", name="Test hyp"):
    r = await client.post("/api/v1/hypotheses/", json={
        "name": name, "date_created": "2026-08-15",
        "lab_id": lab_id, "visibility": visibility,
    })
    assert r.status_code == 201, r.text
    return r.json()


@pytest.mark.asyncio
async def test_outsider_cannot_post_to_private_observation(client):
    await create_test_user("op_owner1")
    await create_test_user("op_outsider1")
    await _login(client, "op_owner1")
    obs = await _create_obs(client, lab_id=None, visibility="private", title="Private obs 1")

    await _login(client, "op_outsider1")
    r = await client.post(f"/api/v1/feed/observation/{obs['id']}/posts", json={
        "title": "Injected", "content": "attacker content",
    })
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_non_member_cannot_post_to_lab_observation(client):
    await create_test_user("op_owner2")
    await create_test_user("op_attacker2")
    await _login(client, "op_owner2")
    lab = await _create_lab(client, "Private Lab OP2", is_public=False)
    obs = await _create_obs(client, lab_id=lab["id"], visibility="lab", title="Lab obs 2")

    await _login(client, "op_attacker2")
    r = await client.post(f"/api/v1/feed/observation/{obs['id']}/posts", json={
        "title": "Injected", "content": "attacker content",
    })
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_member_can_post_to_lab_observation(client):
    await create_test_user("op_owner3")
    member = await create_test_user("op_member3")
    await _login(client, "op_owner3")
    lab = await _create_lab(client, "Private Lab OP3", is_public=False)
    obs = await _create_obs(client, lab_id=lab["id"], visibility="lab", title="Lab obs 3")
    await add_lab_member(lab["id"], member.id)

    await _login(client, "op_member3")
    r = await client.post(f"/api/v1/feed/observation/{obs['id']}/posts", json={
        "title": "Legit", "content": "member content",
    })
    assert r.status_code == 200, r.text


@pytest.mark.asyncio
async def test_outsider_cannot_read_comments_on_private_hypothesis_post(client):
    await create_test_user("pc_owner1")
    await create_test_user("pc_outsider1")
    await _login(client, "pc_owner1")
    hyp = await _create_hyp(client, lab_id=None, visibility="private", name="Private hyp PC1")
    r = await client.post(f"/api/v1/feed/hypothesis/{hyp['id']}/posts", json={
        "title": "Post", "content": "content",
    })
    assert r.status_code == 200, r.text
    post = r.json()

    await _login(client, "pc_outsider1")
    r = await client.get(f"/api/v1/feed/posts/{post['id']}/comments")
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_outsider_cannot_post_comment_on_private_hypothesis_post(client):
    await create_test_user("pc_owner2")
    await create_test_user("pc_outsider2")
    await _login(client, "pc_owner2")
    hyp = await _create_hyp(client, lab_id=None, visibility="private", name="Private hyp PC2")
    r = await client.post(f"/api/v1/feed/hypothesis/{hyp['id']}/posts", json={
        "title": "Post", "content": "content",
    })
    assert r.status_code == 200, r.text
    post = r.json()

    await _login(client, "pc_outsider2")
    r = await client.post(f"/api/v1/feed/posts/{post['id']}/comments", json={"content": "injected"})
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_non_member_cannot_comment_on_lab_hypothesis_post(client):
    await create_test_user("pc_owner3")
    await create_test_user("pc_attacker3")
    await _login(client, "pc_owner3")
    lab = await _create_lab(client, "Private Lab PC3", is_public=False)
    hyp = await _create_hyp(client, lab_id=lab["id"], visibility="lab", name="Lab hyp PC3")
    r = await client.post(f"/api/v1/feed/hypothesis/{hyp['id']}/posts", json={
        "title": "Post", "content": "content",
    })
    assert r.status_code == 200, r.text
    post = r.json()

    await _login(client, "pc_attacker3")
    r = await client.post(f"/api/v1/feed/posts/{post['id']}/comments", json={"content": "injected"})
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_member_can_comment_on_lab_hypothesis_post(client):
    await create_test_user("pc_owner4")
    member = await create_test_user("pc_member4")
    await _login(client, "pc_owner4")
    lab = await _create_lab(client, "Private Lab PC4", is_public=False)
    hyp = await _create_hyp(client, lab_id=lab["id"], visibility="lab", name="Lab hyp PC4")
    r = await client.post(f"/api/v1/feed/hypothesis/{hyp['id']}/posts", json={
        "title": "Post", "content": "content",
    })
    assert r.status_code == 200, r.text
    post = r.json()
    await add_lab_member(lab["id"], member.id)

    await _login(client, "pc_member4")
    r = await client.post(f"/api/v1/feed/posts/{post['id']}/comments", json={"content": "legit"})
    assert r.status_code == 200, r.text
