"""Soft-delete, остальные читатели: счётчики лабы, источники результата, загрузка картинок
к записи из корзины."""
import pytest
from fastapi import HTTPException

from app.api.v1.images import _require_owner
from app.api.v1.results import _lab_entity_sources
from app.db.session import AsyncSessionLocal
from app.models.entities import EntityHypothesis, SourceDocument
from app.models.social import Lab
from tests.conftest import create_test_user
from tests.test_calibration_residue import _mk
from tests.test_soft_delete_api import _delete_url, _login


async def _make_lab(client, name):
    r = await client.post("/api/v1/labs", json={
        "name": name, "is_public": False, "open_join": False,
        "goal_type": "task", "new_goal_title": f"Goal {name}",
    })
    assert r.status_code == 200, r.text
    return r.json()["id"]


@pytest.mark.asyncio
async def test_lab_counters_ignore_trashed_records(client):
    u = await create_test_user("lab_cnt")
    await _login(client, u.username)
    lab_id = await _make_lab(client, "Cnt lab")
    oid = await _mk("observation", u.id, "lab-cnt-o", lab_id=lab_id, visibility="lab")
    p_closed = await _mk("prediction", u.id, "lab-cnt-p1", lab_id=lab_id, visibility="lab", status="подтвердился")
    await _mk("prediction", u.id, "lab-cnt-p2", lab_id=lab_id, visibility="lab", status="не проверен")
    h1 = await _mk("hypothesis", u.id, "lab-cnt-h1")
    h2 = await _mk("hypothesis", u.id, "lab-cnt-h2")
    async with AsyncSessionLocal() as db:
        lab = await db.get(Lab, lab_id)
        db.add_all([EntityHypothesis(parent_type=lab.goal_type, parent_id=lab.goal_id, hypothesis_id=h)
                    for h in (h1, h2)])
        await db.commit()

    async def counts():
        r = await client.get(f"/api/v1/labs/{lab_id}")
        assert r.status_code == 200, r.text
        d = r.json()
        return (d["observations_count"], d["hypotheses_count"], d["predictions_count"], d["results_count"])

    assert await counts() == (1, 2, 2, 0)
    for et, eid in (("observation", oid), ("prediction", p_closed), ("hypothesis", h2)):
        assert (await client.delete(_delete_url(et, eid))).status_code == 204
    assert await counts() == (0, 1, 1, 0)
    for et, eid in (("observation", oid), ("prediction", p_closed), ("hypothesis", h2)):
        assert (await client.post(f"/api/v1/{et}/{eid}/restore")).status_code == 204
    assert await counts() == (1, 2, 2, 0)


@pytest.mark.asyncio
async def test_result_lab_sources_skip_trashed_entities(client):
    u = await create_test_user("res_src")
    await _login(client, u.username)
    lab_id = await _make_lab(client, "Src lab")
    h_live = await _mk("hypothesis", u.id, "res-src-h1", lab_id=lab_id, visibility="lab")
    h_dead = await _mk("hypothesis", u.id, "res-src-h2", lab_id=lab_id, visibility="lab", dead=True)
    async with AsyncSessionLocal() as db:
        db.add_all([SourceDocument(user_id=u.id, entity_type="hypothesis", entity_id=h, url=f"https://example.com/{h}")
                    for h in (h_live, h_dead)])
        await db.commit()
        got = await _lab_entity_sources(db, lab_id)
    assert {(t, i) for _, t, i, _ in got} == {("hypothesis", h_live)}


@pytest.mark.asyncio
async def test_image_owner_check_rejects_trashed_entity(test_user):
    live = await _mk("observation", test_user.id, "img-o1")
    dead = await _mk("observation", test_user.id, "img-o2", dead=True)
    async with AsyncSessionLocal() as db:
        assert (await _require_owner(db, "observation", live, test_user)).id == live
        with pytest.raises(HTTPException) as e:
            await _require_owner(db, "observation", dead, test_user)
        assert e.value.status_code == 404


@pytest.mark.asyncio
async def test_cannot_trash_task_that_is_lab_goal(client):
    u = await create_test_user("goal_task")
    await _login(client, u.username)
    r = await client.post("/api/v1/labs", json={
        "name": "Goal lab", "is_public": False, "open_join": False,
        "goal_type": "task", "new_goal_title": "Protected goal",
    })
    assert r.status_code == 200, r.text
    lab_id = r.json()["id"]
    async with AsyncSessionLocal() as db:
        lab = await db.get(Lab, lab_id)
        tid = lab.goal_id

    from tests.test_soft_delete_api import _delete_url
    r = await client.delete(_delete_url("task", tid))
    assert r.status_code == 400, r.text

    async with AsyncSessionLocal() as db:
        db.execute.__self__  # no-op, keep import used
    async with AsyncSessionLocal() as db:
        lab = await db.get(Lab, lab_id)
        lab.goal_type, lab.goal_id = None, None
        await db.commit()
    assert (await client.delete(_delete_url("task", tid))).status_code == 204
