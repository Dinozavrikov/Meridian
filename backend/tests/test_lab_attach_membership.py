"""
Регрессионные тесты на три access-бага, найденные и исправленные в этой сессии
(документ "Лаборатории", п.1/п.19/п.22, ACCESS_POLICY.md):

1. predictions.py create/update — раньше lab_id/visibility выставлялись без
   проверки членства в лабе (самодельный safe_lab_id вместо resolve_lab_attachment).
2. tasks.py update_task — та же дыра, отдельная инлайн-копия той же логики.
3. labs.py delete_lab — после удаления лабы сущности с visibility="lab" оставались
   с lab_id=NULL и visibility="lab" (нелегальная комбинация).

Паттерн — как в test_labs_access.py: owner/attacker, позитив и негатив.
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


# --- 1. predictions.py: нельзя привязать прогноз к чужой/приватной лабе без членства ---

@pytest.mark.asyncio
async def test_observation_cannot_attach_to_lab_without_membership(client):
    await create_test_user("obs_owner1")
    await create_test_user("obs_attacker1")
    await _login(client, "obs_owner1")
    lab = await _create_lab(client, "Private Lab Obs1", is_public=False)

    await _login(client, "obs_attacker1")
    r = await client.post("/api/v1/observations/", json={
        "date": "2026-08-09", "author": "Attacker", "title": "Injected obs", "text": "Injected obs",
        "visibility": "lab", "lab_id": lab["id"],
    })
    assert r.status_code == 403, "не участник лабы не может привязать к ней наблюдение"


@pytest.mark.asyncio
async def test_observation_can_attach_to_lab_with_membership(client):
    await create_test_user("obs_owner2")
    member = await create_test_user("obs_member2")
    await _login(client, "obs_owner2")
    lab = await _create_lab(client, "Private Lab Obs2", is_public=False)
    await add_lab_member(lab["id"], member.id)

    await _login(client, "obs_member2")
    r = await client.post("/api/v1/observations/", json={
        "date": "2026-08-09", "author": "Member", "title": "Legit obs", "text": "Legit obs",
        "visibility": "lab", "lab_id": lab["id"],
    })
    assert r.status_code == 201, r.text


@pytest.mark.asyncio
async def test_prediction_cannot_attach_to_lab_without_membership(client):
    await create_test_user("pred_owner1")
    await create_test_user("pred_attacker1")
    await _login(client, "pred_owner1")
    lab = await _create_lab(client, "Private Lab Pred1", is_public=False)

    await _login(client, "pred_attacker1")
    r = await client.post("/api/v1/predictions/", json={
        "title": "Injected", "text": "some text", "date_created": "2026-08-06",
        "expected_check_date": "2027-01-01T00:00:00", "visibility": "lab", "lab_id": lab["id"],
    })
    assert r.status_code == 403, "не участник лабы не может привязать к ней прогноз"


@pytest.mark.asyncio
async def test_prediction_can_attach_to_lab_with_membership(client):
    await create_test_user("pred_owner2")
    member = await create_test_user("pred_member2")
    await _login(client, "pred_owner2")
    lab = await _create_lab(client, "Private Lab Pred2", is_public=False)
    await add_lab_member(lab["id"], member.id)

    await _login(client, "pred_member2")
    r = await client.post("/api/v1/predictions/", json={
        "title": "Legit", "text": "some text", "date_created": "2026-08-06",
        "expected_check_date": "2027-01-01T00:00:00", "visibility": "lab", "lab_id": lab["id"],
    })
    assert r.status_code == 201, r.text


# --- 2. tasks.py update_task: та же проверка, но при обновлении своей задачи ---

@pytest.mark.asyncio
async def test_task_update_cannot_attach_to_lab_without_membership(client):
    await create_test_user("task_owner1")
    await create_test_user("task_attacker1")
    await _login(client, "task_owner1")
    lab = await _create_lab(client, "Private Lab Task1", is_public=False)

    await _login(client, "task_attacker1")
    created = await client.post("/api/v1/tasks/", json={"name": "My own task"})
    assert created.status_code == 201, created.text
    tid = created.json()["id"]

    r = await client.put(f"/api/v1/tasks/{tid}", json={
        "name": "My own task", "visibility": "lab", "lab_id": lab["id"],
    })
    assert r.status_code == 403, "нельзя привязать свою задачу к чужой лабе без членства"


@pytest.mark.asyncio
async def test_task_update_can_attach_to_lab_with_membership(client):
    await create_test_user("task_owner2")
    member = await create_test_user("task_member2")
    await _login(client, "task_owner2")
    lab = await _create_lab(client, "Private Lab Task2", is_public=False)
    await add_lab_member(lab["id"], member.id)

    await _login(client, "task_member2")
    created = await client.post("/api/v1/tasks/", json={"name": "My own task 2"})
    assert created.status_code == 201, created.text
    tid = created.json()["id"]

    r = await client.put(f"/api/v1/tasks/{tid}", json={
        "name": "My own task 2", "visibility": "lab", "lab_id": lab["id"],
    })
    assert r.status_code == 200, r.text
    assert r.json()["lab_id"] == lab["id"]


# --- 3. labs.py delete_lab: visibility не должна повиснуть как "lab" с lab_id=NULL ---

@pytest.mark.asyncio
async def test_delete_lab_resets_dangling_lab_visibility(client):
    await create_test_user("del_owner1")
    await _login(client, "del_owner1")
    lab = await _create_lab(client, "Private Lab ToDelete", is_public=False)

    from app.models.entities import ResearchTask
    async with AsyncSessionLocal() as db:
        goal = await db.get(ResearchTask, lab["goal_id"])
        assert goal.visibility == "lab", f"перед удалением цель должна быть visibility=lab, получили {goal.visibility}"

    r = await client.delete(f"/api/v1/labs/{lab['id']}")
    assert r.status_code == 200, r.text

    async with AsyncSessionLocal() as db:
        goal_after = await db.get(ResearchTask, lab["goal_id"])
        assert goal_after.lab_id is None, "lab_id должен обнулиться после удаления лабы"
        assert goal_after.visibility == "private", (
            f"после удаления лабы visibility='lab' с lab_id=NULL — нелегальная комбинация, "
            f"ожидали 'private', получили {goal_after.visibility}"
        )
