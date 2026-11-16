"""Воспроизведение подозрения: обратные FK-рёбра публичного графа
(global_graph.py::fk_edges_from_entity, direction=backward). id прогноза/задачи
намеренно != id гипотезы (dummy-записи), иначе перепутанные id совпали бы случайно."""
import pytest

from app.db.session import AsyncSessionLocal
from app.models.entities import EntityHypothesis
from tests.conftest import create_test_user
from tests.test_soft_delete_api import _build


async def _mk_public(etype, uid, slug, **attrs):
    async with AsyncSessionLocal() as db:
        o = _build(etype, uid, slug, False, 0)
        o.visibility = "public"
        for k, v in attrs.items():
            setattr(o, k, v)
        db.add(o)
        await db.commit()
        await db.refresh(o)
        return o.id


async def _setup(uid):
    await _mk_public("prediction", uid, "fk-pred-dummy")
    await _mk_public("task", uid, "fk-task-dummy")
    hid = await _mk_public("hypothesis", uid, "fk-hyp")
    pid = await _mk_public("prediction", uid, "fk-pred", hypothesis_id=hid)
    tid = await _mk_public("task", uid, "fk-task")
    async with AsyncSessionLocal() as db:
        db.add(EntityHypothesis(parent_type="task", parent_id=tid, hypothesis_id=hid))
        await db.commit()
    return hid, pid, tid


async def _edges(client, entity_type):
    r = await client.get(f"/api/v1/graph/global/expand/{entity_type}")
    assert r.status_code == 200, r.text
    return [(e["from"], e["to"]) for e in r.json()["edges"]]


@pytest.mark.asyncio
async def test_fk_edge_forward_prediction_to_hypothesis_control(client):
    u = await create_test_user("fk_fwd")
    hid, pid, _ = await _setup(u.id)
    assert (f"prediction_{pid}", f"hypothesis_{hid}") in await _edges(client, "prediction")


@pytest.mark.asyncio
async def test_fk_edge_backward_prediction_to_hypothesis(client):
    u = await create_test_user("fk_bwd")
    hid, pid, _ = await _setup(u.id)
    assert (f"prediction_{pid}", f"hypothesis_{hid}") in await _edges(client, "hypothesis")


@pytest.mark.asyncio
async def test_fk_edge_backward_task_to_hypothesis_via_assoc_table(client):
    u = await create_test_user("fk_bwd_assoc")
    hid, _, tid = await _setup(u.id)
    assert (f"task_{tid}", f"hypothesis_{hid}") in await _edges(client, "hypothesis")


@pytest.mark.asyncio
async def test_fk_edge_backward_hides_private_prediction(client):
    """Раньше видимость проверялась на записи с id гипотезы, а не прогноза — и в граф
    могли попасть id чужой непубличной записи."""
    u = await create_test_user("fk_priv")
    await _mk_public("prediction", u.id, "fk-priv-dummy")
    hid = await _mk_public("hypothesis", u.id, "fk-priv-hyp")
    await _mk_public("prediction", u.id, "fk-priv-secret", hypothesis_id=hid, visibility="private")
    assert await _edges(client, "hypothesis") == []
