"""Состав снимка: участники лабы, шкалы задач и их привязки, история статусов гипотез. Проверяется реальное
поведение: что попало в копию, что нет, что копия переживает физическое удаление оригиналов, как это видно в
просмотре, диффе и постороннему."""
import json

import pytest
from sqlalchemy import text

from app.db.session import AsyncSessionLocal
from app.models.entities import HypStatusHistory, Hypothesis, ResearchTask, TaskScale, TaskScaleHypothesis
from app.services import checkpoint_redaction as red
from app.services import lab_checkpoints as svc
from tests.test_lab_checkpoints import _dirs, _items, _lab_kw, _mk, _snapshot, _view, _world  # noqa: F401
from tests.test_lab_checkpoints_stage2 import _diff
from tests.test_undo import _login


@pytest.mark.asyncio
async def test_lab_members_are_snapshotted_history_survives_leaving_and_outsiders_never_see_them(client):
    w = await _world("owner", "member1")
    await _login(client, "owner")
    first = await _snapshot(client, w.lab_id, "до ухода")
    async with AsyncSessionLocal() as db:
        await db.execute(text("DELETE FROM lab_members WHERE lab_id = :l AND user_id = :u"),
                         {"l": w.lab_id, "u": w.uid["member1"]})
        await db.commit()
    second = await _snapshot(client, w.lab_id, "после ухода")

    members = lambda rows: {i.object_key: i.snapshot_data for i in rows if i.kind == "lab_member"}
    before, after = members(await _items(first["id"])), members(await _items(second["id"]))
    o, m = w.uid["owner"], w.uid["member1"]
    assert set(before) == {f"lab_member:{o}", f"lab_member:{m}"}
    assert before[f"lab_member:{o}"]["role"] == "owner" and before[f"lab_member:{m}"]["role"] == "member"
    assert set(after) == {f"lab_member:{o}"}                      # старый снимок помнит ушедшего, новый — нет

    view = await _view(client, w.lab_id, first["id"])
    assert sorted(x["data"]["user_id"] for x in view["lab"]["children"]["lab_member"]) == sorted([o, m])
    d = await _diff(client, w.lab_id, first["id"], second["id"])
    assert [(r["status"], r["data"]["user_id"]) for r in d["records"] if r["kind"] == "lab_member"] == [("removed", m)]

    public = red.public_rows(await _items(first["id"]))           # вид постороннего построен из тех же сохранённых строк
    assert not [r for r in public if r.kind == "lab_member"]
    assert "user_id" not in json.dumps([r.snapshot_data for r in public])


@pytest.mark.asyncio
async def test_task_scales_and_status_history_follow_the_rules_and_survive_deletion(client):
    w = await _world("owner")
    async with AsyncSessionLocal() as db:
        uid = w.uid["owner"]
        task = await _mk(db, ResearchTask, uid, name="T", **_lab_kw(w.lab_id))
        trashed = await _mk(db, ResearchTask, uid, name="T-trash", **_lab_kw(w.lab_id))
        hyp_in = await _mk(db, Hypothesis, uid, name="in", **_lab_kw(w.lab_id))
        hyp_out = await _mk(db, Hypothesis, uid, name="out")                  # вне лабы
        scale = await _mk(db, TaskScale, uid, task_id=task.id, name="S", current_val=1)
        await _mk(db, TaskScale, uid, task_id=trashed.id, name="S-trash")
        db.add_all([TaskScaleHypothesis(task_scale_id=scale.id, hypothesis_id=hyp_in.id),
                    TaskScaleHypothesis(task_scale_id=scale.id, hypothesis_id=hyp_out.id)])
        await _mk(db, HypStatusHistory, uid, hypothesis_id=hyp_in.id, status="проверяется")
        await db.execute(text("UPDATE research_tasks SET deleted_at = now() WHERE id = :i"), {"i": trashed.id})
        await db.commit()
        task_id, scale_id, hin = task.id, scale.id, hyp_in.id

    await _login(client, "owner")
    c1 = await _snapshot(client, w.lab_id, "до")
    rows = await _items(c1["id"])
    keys = lambda kind: sorted(i.object_key for i in rows if i.kind == kind)
    assert keys("task_scale") == [f"task_scale:{scale_id}"]                   # шкала задачи из корзины не входит
    assert keys("task_scale_hypothesis") == [f"task_scale_hypothesis:{scale_id}:{hin}"]   # гипотеза вне лабы — нет
    assert [i.snapshot_data["status"] for i in rows if i.kind == "hyp_status_history"] == ["проверяется"]

    view = await _view(client, w.lab_id, c1["id"])
    tnode = next(n for n in view["entities"]["task"] if n["entity_id"] == task_id)
    assert [c["data"]["name"] for c in tnode["children"]["task_scale"]] == ["S"]
    hnode = next(n for n in view["entities"]["hypothesis"] if n["entity_id"] == hin)
    assert [c["data"]["status"] for c in hnode["children"]["hyp_status_history"]] == ["проверяется"]
    public = red.public_rows(rows)
    assert {r.kind for r in public} >= {"task_scale", "task_scale_hypothesis", "hyp_status_history"}
    assert "user_id" not in json.dumps([r.snapshot_data for r in public])

    async with AsyncSessionLocal() as db:
        await db.execute(text("UPDATE task_scales SET current_val = 5 WHERE id = :i"), {"i": scale_id})
        await db.commit()
    c2 = await _snapshot(client, w.lab_id, "после")
    d = await _diff(client, w.lab_id, c1["id"], c2["id"])
    changed = [r for r in d["records"] if r["kind"] == "task_scale"]
    assert len(changed) == 1 and changed[0]["status"] == "changed"
    assert changed[0]["changed_fields"]["current_val"] == {"old": 1, "new": 5}

    async with AsyncSessionLocal() as db:                                     # оригиналы исчезли физически
        await db.execute(text("DELETE FROM task_scales WHERE id = :i"), {"i": scale_id})
        await db.execute(text("DELETE FROM hyp_status_history WHERE hypothesis_id = :h"), {"h": hin})
        await db.commit()
        assert await svc.verify_checkpoint(db, c1["id"]) == [] and await svc.verify_checkpoint(db, c2["id"]) == []
    old = [i for i in await _items(c1["id"]) if i.kind == "task_scale"]
    assert len(old) == 1 and old[0].snapshot_data["current_val"] == 1 and old[0].snapshot_data["name"] == "S"
    assert [i.snapshot_data["status"] for i in await _items(c1["id"]) if i.kind == "hyp_status_history"] == ["проверяется"]
