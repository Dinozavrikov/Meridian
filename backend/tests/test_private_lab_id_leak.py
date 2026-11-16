"""Приватная запись с lab_id не должна быть видна участнику лаборатории через связи и счётчик связей."""
import pytest
from sqlalchemy import update

from tests.conftest import add_lab_member, create_test_user
from app.db.session import AsyncSessionLocal
from app.models.entities import Observation


async def _login(client, username, password="pass12345"):
    r = await client.post("/api/v1/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200, r.text


@pytest.mark.asyncio
async def test_private_record_with_lab_id_is_hidden_from_lab_member(client):
    await create_test_user("pl_a"); b = await create_test_user("pl_b")
    await _login(client, "pl_a")
    r = await client.post("/api/v1/labs", json={"name": "pl-lab", "is_public": False, "open_join": False,
                                                "goal_type": "task", "new_goal_title": "g"})
    assert r.status_code == 200, r.text
    lab = r.json()["id"]
    await add_lab_member(lab, b.id, "member")
    r = await client.post("/api/v1/hypotheses/", json={"name": "Г", "description": "d", "date_created": "2026-08-06",
                                                       "status": "идея", "visibility": "public"})
    assert r.status_code in (200, 201), r.text
    h = r.json()["id"]
    r = await client.post("/api/v1/observations/", json={"title": "Секрет", "date": "2026-09-23", "author": "a", "text": "x",
                                                         "lab_id": None, "visibility": "private", "tags": []})
    assert r.status_code == 201, r.text
    o = r.json()["id"]
    async with AsyncSessionLocal() as db:   # приватная запись, у которой почему-то стоит lab_id
        await db.execute(update(Observation).where(Observation.id == o).values(lab_id=lab, visibility="private"))
        await db.commit()
    r = await client.post(f"/api/v1/graph/links?from_type=observation&from_id={o}&to_type=hypothesis&to_id={h}&link_type=связано")
    assert r.status_code == 200, r.text

    await _login(client, "pl_b")
    r = await client.get(f"/api/v1/graph/related/hypothesis/{h}")
    assert r.status_code == 200, r.text                       # контроль: публичная гипотеза видна участнику
    assert o not in [i["id"] for i in r.json()["related"].get("observation", [])]
    r = await client.get(f"/api/v1/hypothesis/{h}/preview")
    assert r.status_code == 200 and r.json()["links_count"] == 0
