"""Видимость сущности, созданной в лаборатории, выводит БЭКЕНД из публичности лабы
(lab_access.visibility_from_lab): присланное клиентом visibility игнорируется. Формы во вкладках
лабораторий не дают выбрать видимость и полагаются на это (LabLockedNote, frontend), поэтому здесь
проверяется реально сохранённое значение и доступ постороннего, а не то, что шлёт клиент."""
import itertools

import pytest

from tests.conftest import add_lab_member, create_test_user

_seq = itertools.count(1)


async def _login(client, username, password="pass12345"):
    r = await client.post("/api/v1/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200


async def _create_lab(client, name, is_public):
    r = await client.post("/api/v1/labs", json={
        "name": name, "is_public": is_public, "open_join": False,
        "goal_type": "task", "new_goal_title": f"Goal for {name}",
    })
    assert r.status_code == 200, r.text
    return r.json()


def _obs(lab_id, visibility):
    return {"title": "obs", "date": "2026-08-15", "author": "t", "text": "body", "lab_id": lab_id, "visibility": visibility}


def _pred(lab_id, visibility):
    return {"title": "pred", "text": "body", "date_created": "2026-08-15", "expected_check_date": "2027-01-01T00:00:00Z",
            "confidence": 50, "lab_id": lab_id, "visibility": visibility}


def _hyp(lab_id, visibility):
    return {"name": "hyp", "description": "body", "date_created": "2026-08-15", "status": "идея",
            "lab_id": lab_id, "visibility": visibility}


CASES = [("observations", _obs), ("predictions", _pred), ("hypotheses", _hyp)]
IDS = [c[0] for c in CASES]


@pytest.mark.asyncio
@pytest.mark.parametrize("kind,body", CASES, ids=IDS)
async def test_public_lab_makes_entity_public_even_if_client_sent_lab(client, kind, body):
    n = next(_seq)
    await create_test_user(f"vp_owner{n}")
    await create_test_user(f"vp_out{n}")
    await _login(client, f"vp_owner{n}")
    lab = await _create_lab(client, f"Public V{n}", is_public=True)

    r = await client.post(f"/api/v1/{kind}/", json=body(lab["id"], "lab"))
    assert r.status_code == 201, r.text
    created = r.json()
    assert created["visibility"] == "public"
    assert (await client.get(f"/api/v1/{kind}/{created['id']}")).json()["visibility"] == "public"

    await _login(client, f"vp_out{n}")
    assert (await client.get(f"/api/v1/{kind}/{created['id']}")).status_code == 200


@pytest.mark.asyncio
@pytest.mark.parametrize("kind,body", CASES, ids=IDS)
async def test_private_lab_keeps_entity_lab_even_if_client_sent_public(client, kind, body):
    n = next(_seq)
    await create_test_user(f"vl_owner{n}")
    member = await create_test_user(f"vl_member{n}")
    await create_test_user(f"vl_out{n}")
    await _login(client, f"vl_owner{n}")
    lab = await _create_lab(client, f"Private V{n}", is_public=False)
    await add_lab_member(lab["id"], member.id)

    r = await client.post(f"/api/v1/{kind}/", json=body(lab["id"], "public"))
    assert r.status_code == 201, r.text
    created = r.json()
    assert created["visibility"] == "lab"

    await _login(client, f"vl_member{n}")
    assert (await client.get(f"/api/v1/{kind}/{created['id']}")).status_code == 200
    await _login(client, f"vl_out{n}")
    assert (await client.get(f"/api/v1/{kind}/{created['id']}")).status_code in (403, 404)


@pytest.mark.asyncio
async def test_my_labs_list_exposes_is_public(client):
    """Форма в лаборатории (useLabEntityVisibility) берёт публичность отсюда."""
    n = next(_seq)
    await create_test_user(f"vm_owner{n}")
    await _login(client, f"vm_owner{n}")
    pub = await _create_lab(client, f"Pub M{n}", is_public=True)
    priv = await _create_lab(client, f"Priv M{n}", is_public=False)

    r = await client.get("/api/v1/labs")
    assert r.status_code == 200
    by_id = {lab["id"]: lab for lab in r.json()}
    assert by_id[pub["id"]]["is_public"] is True
    assert by_id[priv["id"]]["is_public"] is False
