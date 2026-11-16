"""Гипотеза, созданная в лаборатории: автопривязка к цели (становится «конкурирующей») — только у owner/admin.
Гипотеза обычного участника — ПРЕДЛОЖЕНИЕ: видна участникам, но не привязана и не в счётчике «N гипотез», пока
owner/admin не примет её (ACCESS_POLICY.md, ATTACH/REJECT). Раньше create_hyp привязывал любому участнику —
в обход одобрения. Проверяется реальное состояние через API (счётчик карточки лаборатории считает только привязанные)."""
import inspect
import itertools

import pytest

from tests.conftest import add_lab_member, create_test_user

_seq = itertools.count(1)


async def _login(client, username, password="pass12345"):
    r = await client.post("/api/v1/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200


async def _create_lab(client, name):
    r = await client.post("/api/v1/labs", json={
        "name": name, "is_public": False, "open_join": False,
        "goal_type": "task", "new_goal_title": f"Goal for {name}",
    })
    assert r.status_code == 200, r.text
    return r.json()


async def _add_member(lab_id, user_id, role):
    params = inspect.signature(add_lab_member).parameters
    assert "role" in params, f"tests.conftest.add_lab_member не принимает role: {list(params)}"
    await add_lab_member(lab_id, user_id, role=role)


def _hyp(lab_id, name):
    return {"name": name, "description": "d", "date_created": "2026-08-15", "status": "идея",
            "visibility": "lab", "lab_id": lab_id}


async def _competing_count(client, lab_id):
    r = await client.get(f"/api/v1/labs/{lab_id}")
    assert r.status_code == 200, r.text
    return r.json()["hypotheses_count"]


async def _setup(client, member_role=None):
    n = next(_seq)
    owner = await create_test_user(f"hp_owner{n}")
    member = await create_test_user(f"hp_member{n}")
    await _login(client, f"hp_owner{n}")
    lab = await _create_lab(client, f"Proposals {n}")
    if member_role:
        await _add_member(lab["id"], member.id, member_role)
    return n, lab


@pytest.mark.asyncio
async def test_member_created_hypothesis_stays_a_proposal(client):
    n, lab = await _setup(client, member_role="member")
    await _login(client, f"hp_member{n}")
    r = await client.post("/api/v1/hypotheses/", json=_hyp(lab["id"], "Предложение участника"))
    assert r.status_code == 201, r.text
    hid = r.json()["id"]

    await _login(client, f"hp_owner{n}")
    assert await _competing_count(client, lab["id"]) == 0, "гипотеза участника не должна стать конкурирующей без одобрения"
    queue = (await client.get("/api/v1/hypotheses/", params={"lab_id": lab["id"]})).json()
    assert hid in [h["id"] for h in queue], "предложение должно быть видно владельцу в очереди"


@pytest.mark.asyncio
async def test_owner_created_hypothesis_is_attached_immediately(client):
    n, lab = await _setup(client)
    r = await client.post("/api/v1/hypotheses/", json=_hyp(lab["id"], "Гипотеза владельца"))
    assert r.status_code == 201, r.text
    assert await _competing_count(client, lab["id"]) == 1


@pytest.mark.asyncio
async def test_admin_created_hypothesis_is_attached_immediately(client):
    n, lab = await _setup(client, member_role="admin")
    await _login(client, f"hp_member{n}")
    r = await client.post("/api/v1/hypotheses/", json=_hyp(lab["id"], "Гипотеза админа"))
    assert r.status_code == 201, r.text
    await _login(client, f"hp_owner{n}")
    assert await _competing_count(client, lab["id"]) == 1


@pytest.mark.asyncio
async def test_owner_attach_turns_a_member_proposal_into_a_competing_hypothesis(client):
    n, lab = await _setup(client, member_role="member")
    await _login(client, f"hp_member{n}")
    hid = (await client.post("/api/v1/hypotheses/", json=_hyp(lab["id"], "Предложение"))).json()["id"]

    await _login(client, f"hp_owner{n}")
    assert await _competing_count(client, lab["id"]) == 0
    r = await client.post(f"/api/v1/labs/{lab['id']}/hypotheses/{hid}/attach")
    assert r.status_code == 200, r.text
    assert await _competing_count(client, lab["id"]) == 1


@pytest.mark.asyncio
async def test_member_cannot_attach_even_own_proposal(client):
    n, lab = await _setup(client, member_role="member")
    await _login(client, f"hp_member{n}")
    hid = (await client.post("/api/v1/hypotheses/", json=_hyp(lab["id"], "Своё предложение"))).json()["id"]
    r = await client.post(f"/api/v1/labs/{lab['id']}/hypotheses/{hid}/attach")
    assert r.status_code == 403

    await _login(client, f"hp_owner{n}")
    assert await _competing_count(client, lab["id"]) == 0


async def _goal_id(client, lab_id):
    detail = (await client.get(f"/api/v1/labs/{lab_id}")).json()
    assert detail.get("goal_type") == "task" and detail.get("goal_id"), f"в карточке лаборатории нет цели-задачи: {detail}"
    return detail["goal_id"]


@pytest.mark.asyncio
async def test_member_cannot_attach_a_proposal_to_the_goal_task_directly(client):
    """Привязка гипотезы к цели напрямую через /tasks/{goal}/hypotheses/{hid} — тоже только право управления
    лабораторией: иначе участник обошёл бы очередь предложений этим путём."""
    n, lab = await _setup(client, member_role="member")
    await _login(client, f"hp_owner{n}")
    goal_id = await _goal_id(client, lab["id"])
    await _login(client, f"hp_member{n}")
    hid = (await client.post("/api/v1/hypotheses/", json=_hyp(lab["id"], "Предложение"))).json()["id"]

    r = await client.post(f"/api/v1/tasks/{goal_id}/hypotheses/{hid}")
    assert r.status_code in (403, 404), r.text

    await _login(client, f"hp_owner{n}")
    assert await _competing_count(client, lab["id"]) == 0


@pytest.mark.asyncio
async def test_owner_can_attach_a_member_proposal_through_the_goal_task(client):
    n, lab = await _setup(client, member_role="member")
    await _login(client, f"hp_owner{n}")
    goal_id = await _goal_id(client, lab["id"])
    await _login(client, f"hp_member{n}")
    hid = (await client.post("/api/v1/hypotheses/", json=_hyp(lab["id"], "Предложение"))).json()["id"]

    await _login(client, f"hp_owner{n}")
    r = await client.post(f"/api/v1/tasks/{goal_id}/hypotheses/{hid}")
    assert r.status_code == 204, r.text
    assert await _competing_count(client, lab["id"]) == 1
