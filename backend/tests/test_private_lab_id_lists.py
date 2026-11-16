"""Приватная запись с lab_id не должна быть видна участнику лаборатории в списках.
Парный тест к test_private_lab_id_leak (там связи и счётчик связей, здесь фильтр списков)."""
import pytest
from sqlalchemy import select, update

from app.core.lab_access import entity_visibility_filter
from app.db.session import AsyncSessionLocal
from app.models.entities import Observation
from tests.conftest import add_lab_member, create_test_user


async def _login(client, username, password="pass12345"):
    r = await client.post("/api/v1/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200, r.text


async def _setup(client):
    """Владелец vl_a, участник лаборатории vl_b. У a две записи: приватная с lab_id и честная (visibility=lab)."""
    await create_test_user("vl_a")
    b = await create_test_user("vl_b")
    await _login(client, "vl_a")
    r = await client.post("/api/v1/labs", json={"name": "vl-lab", "is_public": False, "open_join": False,
                                                "goal_type": "task", "new_goal_title": "g"})
    assert r.status_code == 200, r.text
    lab = r.json()["id"]
    await add_lab_member(lab, b.id, "member")
    base = {"title": "t", "date": "2026-09-23", "author": "a", "text": "x", "lab_id": None, "visibility": "private", "tags": []}
    r = await client.post("/api/v1/observations/", json={**base, "title": "Секрет"})
    assert r.status_code == 201, r.text
    secret = r.json()["id"]
    r = await client.post("/api/v1/observations/", json={**base, "title": "Лабораторная", "lab_id": lab, "visibility": "lab"})
    assert r.status_code == 201, r.text
    shared = r.json()["id"]
    async with AsyncSessionLocal() as db:   # приватная запись, у которой почему-то стоит lab_id
        await db.execute(update(Observation).where(Observation.id == secret).values(lab_id=lab, visibility="private"))
        await db.commit()
    return b.id, secret, shared


@pytest.mark.asyncio
async def test_list_filter_hides_private_record_with_lab_id(client):
    b_id, secret, shared = await _setup(client)
    async with AsyncSessionLocal() as db:
        ids = set((await db.execute(select(Observation.id).where(entity_visibility_filter(Observation, b_id)))).scalars())
    assert shared in ids            # контроль: честная лабораторная запись участнику видна
    assert secret not in ids


@pytest.mark.asyncio
async def test_observations_list_api_hides_private_record_with_lab_id(client):
    b_id, secret, shared = await _setup(client)
    await _login(client, "vl_b")
    r = await client.get("/api/v1/observations/")
    assert r.status_code == 200, r.text
    ids = {o["id"] for o in r.json()}
    assert shared in ids            # контроль: честная лабораторная запись в списке есть
    assert secret not in ids


@pytest.mark.asyncio
async def test_public_lab_record_stays_listed(client):
    """ОХРАННЫЙ (зелёный и до патча): строгость не должна выкинуть публичные записи публичной лаборатории."""
    await create_test_user("vp_a")
    b = await create_test_user("vp_b")
    await _login(client, "vp_a")
    r = await client.post("/api/v1/labs", json={"name": "vp-lab", "is_public": True, "open_join": False,
                                                "goal_type": "task", "new_goal_title": "g"})
    assert r.status_code == 200, r.text
    lab = r.json()["id"]
    await add_lab_member(lab, b.id, "member")
    r = await client.post("/api/v1/observations/", json={"title": "Публичная", "date": "2026-09-23", "author": "a",
                                                         "text": "x", "lab_id": lab, "visibility": "public", "tags": []})
    assert r.status_code == 201, r.text
    oid = r.json()["id"]
    async with AsyncSessionLocal() as db:
        vis = (await db.execute(select(Observation.visibility).where(Observation.id == oid))).scalar_one()
        assert vis == "public"      # контроль: запись правда публичная и с lab_id
        ids = set((await db.execute(select(Observation.id).where(entity_visibility_filter(Observation, b.id)))).scalars())
    assert oid in ids
