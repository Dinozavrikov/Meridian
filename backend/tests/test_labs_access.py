"""
Тесты на labs.py: 403/404-консистентность (документ раздел 29) и видимость
списка участников публичной лабы для гостя/постороннего (решено явно:
гость видит список участников публичной лабы так же, как саму лабу).
"""
import pytest
from tests.conftest import create_test_user, add_lab_member
from app.db.session import AsyncSessionLocal


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


@pytest.mark.asyncio
async def test_guest_sees_members_of_public_lab(client):
    await create_test_user("labs_owner1")
    await _login(client, "labs_owner1")
    lab = await _create_lab(client, "Public Lab 1", is_public=True)
    client.cookies.clear()

    r = await client.get(f"/api/v1/labs/{lab['id']}/members")
    assert r.status_code == 200, "гость должен видеть участников публичной лабы (как саму лабу)"
    members = r.json()
    assert any(m["username"] == "labs_owner1" for m in members)


@pytest.mark.asyncio
async def test_guest_cannot_see_members_of_private_lab(client):
    await create_test_user("labs_owner2")
    await _login(client, "labs_owner2")
    lab = await _create_lab(client, "Private Lab 1", is_public=False)
    client.cookies.clear()

    r = await client.get(f"/api/v1/labs/{lab['id']}/members")
    assert r.status_code == 401, "гость не должен видеть участников приватной лабы"


@pytest.mark.asyncio
async def test_outsider_sees_members_of_public_lab(client):
    await create_test_user("labs_owner3")
    await create_test_user("labs_outsider3")
    await _login(client, "labs_owner3")
    lab = await _create_lab(client, "Public Lab 3", is_public=True)

    await _login(client, "labs_outsider3")
    r = await client.get(f"/api/v1/labs/{lab['id']}/members")
    assert r.status_code == 200, "залогиненный посторонний видит участников публичной лабы"


@pytest.mark.asyncio
async def test_outsider_cannot_see_members_of_private_lab(client):
    await create_test_user("labs_owner4")
    await create_test_user("labs_outsider4")
    await _login(client, "labs_owner4")
    lab = await _create_lab(client, "Private Lab 4", is_public=False)

    await _login(client, "labs_outsider4")
    r = await client.get(f"/api/v1/labs/{lab['id']}/members")
    assert r.status_code == 403, "посторонний не должен видеть участников приватной лабы"


@pytest.mark.asyncio
async def test_nonexistent_lab_returns_404_not_403(client):
    await create_test_user("labs_user5")
    await _login(client, "labs_user5")

    fake_id = 999999
    r = await client.get(f"/api/v1/labs/{fake_id}/members")
    assert r.status_code == 404, "несуществующая лаба — 404, не 403 (документ, раздел 29)"

    r = await client.patch(f"/api/v1/labs/{fake_id}/members/1/role", json={"role": "admin"})
    assert r.status_code == 404

    r = await client.get(f"/api/v1/labs/{fake_id}/requests")
    assert r.status_code == 404

    r = await client.post(f"/api/v1/labs/{fake_id}/requests/1/accept")
    assert r.status_code == 404

    r = await client.post(f"/api/v1/labs/{fake_id}/requests/1/decline", json={"reason": ""})
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_member_still_403_not_404_when_lacking_permission(client):
    """Убедиться, что фикс 404-для-несуществующей-лабы не сломал 403 для
    существующей лабы, где просто не хватает прав."""
    await create_test_user("labs_owner6")
    member_user = await create_test_user("labs_member6")
    await _login(client, "labs_owner6")
    lab = await _create_lab(client, "Private Lab 6", is_public=False)

    await add_lab_member(lab["id"], member_user.id)

    await _login(client, "labs_member6")
    r = await client.get(f"/api/v1/labs/{lab['id']}/requests")
    assert r.status_code == 403, "обычный member не видит заявки — лаба существует, значит 403, не 404"

    r = await client.patch(f"/api/v1/labs/{lab['id']}/members/{member_user.id}/role", json={"role": "admin"})
    assert r.status_code == 403, "не-owner не может менять роли — лаба существует, значит 403"


@pytest.mark.asyncio
async def test_new_question_goal_visibility_matches_lab_publicity(client):
    """Симметрия с task: question-цель публичной лабы должна иметь
    visibility='public' в БД, не 'private' с молчаливой утечкой через lab_id."""
    await create_test_user("labs_qgoal_owner")
    await _login(client, "labs_qgoal_owner")

    r = await client.post("/api/v1/labs", json={
        "name": "Public Q-Goal Lab", "is_public": True,
        "goal_type": "question", "new_goal_title": "Public question goal",
    })
    assert r.status_code == 200, r.text
    lab = r.json()

    from app.models.entities import Question
    async with AsyncSessionLocal() as db:
        q = await db.get(Question, lab["goal_id"])
        assert q.visibility == "public", f"question-цель публичной лабы должна быть public, получили {q.visibility}"


@pytest.mark.asyncio
async def test_existing_question_attached_as_goal_gets_lab_visibility(client):
    """Та же симметрия для ветки 'привязать существующий question' —
    было: visibility не трогался вообще (оставался private для публичной лабы)."""
    await create_test_user("labs_qgoal_owner2")
    await _login(client, "labs_qgoal_owner2")

    q = (await client.post("/api/v1/questions/", json={
        "title": "Pre-existing private question", "date_created": "2026-08-06",
        "status": "открыт", "visibility": "private",
    })).json()

    r = await client.post("/api/v1/labs", json={
        "name": "Public Q-Goal Lab 2", "is_public": True,
        "goal_type": "question", "goal_id": q["id"],
    })
    assert r.status_code == 200, r.text

    from app.models.entities import Question
    async with AsyncSessionLocal() as db:
        q_after = await db.get(Question, q["id"])
        assert q_after.visibility == "public", f"после привязки к публичной лабе должно стать public, получили {q_after.visibility}"


@pytest.mark.asyncio
async def test_private_lab_question_goal_gets_lab_visibility(client):
    """Контрольный случай: для приватной лабы visibility_from_lab(False) даёт
    'lab' (не 'public', и больше не хардкод 'private') — симметрично с task."""
    await create_test_user("labs_qgoal_owner3")
    await _login(client, "labs_qgoal_owner3")

    r = await client.post("/api/v1/labs", json={
        "name": "Private Q-Goal Lab", "is_public": False,
        "goal_type": "question", "new_goal_title": "Private question goal",
    })
    assert r.status_code == 200, r.text
    lab = r.json()

    from app.models.entities import Question
    async with AsyncSessionLocal() as db:
        q = await db.get(Question, lab["goal_id"])
        assert q.visibility == "lab", f"ожидали 'lab' (visibility_from_lab(False)), получили {q.visibility}"
