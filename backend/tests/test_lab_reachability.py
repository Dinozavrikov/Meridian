"""
Тесты на access-model лабораторий: reachability через связи (Link-ветка opened_via_link_condition,
single-hop, см. lab_access.py) и изоляцию всего, что дальше одного хопа.
"""
import pytest
from tests.conftest import create_test_user, add_lab_member


async def _login(client, username, password="pass12345"):
    r = await client.post("/api/v1/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_lab_member_reaches_linked_private_entity(client):
    """Приватная сущность, ни разу не привязанная к лабе, становится видна
    участнику лабы, если владелец связал её (Link) с сущностью лабы —
    один хоп трактуется как осознанная публикация."""
    owner = await create_test_user("lab_owner1")
    member = await create_test_user("lab_member1")
    outsider = await create_test_user("lab_outsider1")

    await _login(client, "lab_owner1")
    lab = (await client.post("/api/v1/labs", json={
        "name": "Test Lab", "is_public": False,
        "goal_type": "task", "new_goal_title": "Lab goal",
    })).json()

    await add_lab_member(lab["id"], member.id)

    hyp = (await client.post("/api/v1/hypotheses/", json={
        "name": "Lab hypothesis", "description": "In the lab",
        "date_created": "2026-08-06", "status": "идея",
        "visibility": "private", "lab_id": lab["id"],
    })).json()

    private_obs = (await client.post("/api/v1/observations/", json={
        "date": "2026-08-06", "author": "Owner", "title": "Private obs", "text": "Private, not attached to any lab",
        "visibility": "private",
    })).json()

    r = await client.post("/api/v1/graph/links", params={
        "from_type": "hypothesis", "from_id": hyp["id"],
        "to_type": "observation", "to_id": private_obs["id"], "share": "lab",
    })
    assert r.status_code == 200

    await _login(client, "lab_member1")
    r = await client.get("/api/v1/observations/")
    ids = [o["id"] for o in r.json()]
    assert private_obs["id"] in ids, "участник лабы должен видеть приватную сущность, связанную с сущностью лабы (single-hop)"

    await _login(client, "lab_outsider1")
    r = await client.get("/api/v1/observations/")
    ids = [o["id"] for o in r.json()]
    assert private_obs["id"] not in ids, "не-участник лабы не должен видеть приватную сущность лабы, даже связанную"


@pytest.mark.asyncio
async def test_reachability_does_not_propagate_past_one_hop(client):
    """Two hops from a lab entity должны оставаться невидимыми — линк
    трактуется как публикация ровно одного шага, не транзитивная утечка."""
    owner = await create_test_user("lab_owner2")
    member = await create_test_user("lab_member2")

    await _login(client, "lab_owner2")
    lab = (await client.post("/api/v1/labs", json={
        "name": "Test Lab 2", "is_public": False,
        "goal_type": "task", "new_goal_title": "Lab goal 2",
    })).json()

    await add_lab_member(lab["id"], member.id)

    hyp = (await client.post("/api/v1/hypotheses/", json={
        "name": "Lab hypothesis 2", "description": "In the lab",
        "date_created": "2026-08-06", "status": "идея",
        "visibility": "private", "lab_id": lab["id"],
    })).json()

    one_hop_obs = (await client.post("/api/v1/observations/", json={
        "date": "2026-08-06", "author": "Owner", "title": "One hop", "text": "One hop away",
        "visibility": "private",
    })).json()
    two_hop_obs = (await client.post("/api/v1/observations/", json={
        "date": "2026-08-06", "author": "Owner", "title": "Two hops", "text": "Two hops away — must stay private",
        "visibility": "private",
    })).json()

    await client.post("/api/v1/graph/links", params={
        "from_type": "hypothesis", "from_id": hyp["id"],
        "to_type": "observation", "to_id": one_hop_obs["id"], "share": "lab",
    })
    await client.post("/api/v1/graph/links", params={
        "from_type": "observation", "from_id": one_hop_obs["id"],
        "to_type": "observation", "to_id": two_hop_obs["id"],
    })

    await _login(client, "lab_member2")
    r = await client.get("/api/v1/observations/")
    ids = [o["id"] for o in r.json()]
    assert one_hop_obs["id"] in ids
    assert two_hop_obs["id"] not in ids, "второй хоп не должен быть достижим — иначе это транзитивная утечка, от которой мы уходили"
