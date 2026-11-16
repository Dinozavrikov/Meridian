"""Снимок лабы хранит роль и отношение конкурирующей гипотезы."""
import pytest

from app.db.session import AsyncSessionLocal
from app.models.entities import EntityHypothesis, Hypothesis, ResearchTask
from tests.test_lab_checkpoints import _items, _lab_kw, _mk, _snapshot, _world
from tests.test_undo import _login


@pytest.mark.asyncio
async def test_snapshot_keeps_role_and_stance(client):
    w = await _world("owner")
    await _login(client, "owner")
    async with AsyncSessionLocal() as db:
        uid = w.uid["owner"]
        task = await _mk(db, ResearchTask, uid, name="T", **_lab_kw(w.lab_id))
        hyp = await _mk(db, Hypothesis, uid, name="H", **_lab_kw(w.lab_id))
        db.add(EntityHypothesis(parent_type="task", parent_id=task.id, hypothesis_id=hyp.id,
                                role="leading", stance="подтверждает"))
        await db.commit()
        key = f"entity_hypothesis:task:{task.id}:{hyp.id}"
    snap = await _snapshot(client, w.lab_id, "с ролью")
    rows = {i.object_key: i.snapshot_data for i in await _items(snap["id"])}
    assert rows[key]["role"] == "leading" and rows[key]["stance"] == "подтверждает"
