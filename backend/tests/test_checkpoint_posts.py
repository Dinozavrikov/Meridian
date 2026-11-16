"""Посты ленты в снимке: копируются как дети ЖИВОЙ записи лабы, переживают физическое удаление, видны в просмотре
и диффе участникам и никогда — постороннему."""
import json

import pytest
from sqlalchemy import text

from app.db.session import AsyncSessionLocal
from app.models.entities import Hypothesis, Observation
from app.models.social import HypothesisPost, ObservationPost
from app.services import checkpoint_redaction as red
from app.services import lab_checkpoints as svc
from tests.test_lab_checkpoints import _dirs, _items, _lab_kw, _mk, _snapshot, _view, _world  # noqa: F401
from tests.test_lab_checkpoints_stage2 import _diff
from tests.test_undo import _login


@pytest.mark.asyncio
async def test_feed_posts_of_live_lab_records_are_snapshotted_survive_deletion_and_are_hidden_from_outsiders(client):
    w = await _world("owner")
    async with AsyncSessionLocal() as db:
        uid = w.uid["owner"]
        hyp = await _mk(db, Hypothesis, uid, name="H", **_lab_kw(w.lab_id))
        obs = await _mk(db, Observation, uid, title="O", text="o", **_lab_kw(w.lab_id))
        trashed = await _mk(db, Observation, uid, title="O-trash", text="o", **_lab_kw(w.lab_id))
        outside = await _mk(db, Observation, uid, title="O-out", text="o")                     # вне лабы
        hp = await _mk(db, HypothesisPost, uid, hypothesis_id=hyp.id, title="hp", content="первый")
        op = await _mk(db, ObservationPost, uid, observation_id=obs.id, title="op", content="пост")
        await _mk(db, ObservationPost, uid, observation_id=trashed.id, title="x", content="из корзины")
        await _mk(db, ObservationPost, uid, observation_id=outside.id, title="y", content="вне лабы")
        await db.execute(text("UPDATE observations SET deleted_at = now() WHERE id = :i"), {"i": trashed.id})
        await db.commit()
        hp_id, op_id, hyp_id, obs_id = hp.id, op.id, hyp.id, obs.id

    await _login(client, "owner")
    c1 = await _snapshot(client, w.lab_id, "до")
    rows = await _items(c1["id"])
    assert sorted(i.object_key for i in rows if i.kind == "post") == sorted(
        [f"post:hypothesis:{hp_id}", f"post:observation:{op_id}"])          # корзина и вне лабы — не входят

    view = await _view(client, w.lab_id, c1["id"])
    hnode = next(n for n in view["entities"]["hypothesis"] if n["entity_id"] == hyp_id)
    onode = next(n for n in view["entities"]["observation"] if n["entity_id"] == obs_id)
    assert [c["data"]["content"] for c in hnode["children"]["post"]] == ["первый"]
    assert [c["data"]["content"] for c in onode["children"]["post"]] == ["пост"]

    public = red.public_rows(rows)
    assert not [r for r in public if r.kind == "post"]
    assert "author_id" not in json.dumps([r.snapshot_data for r in public])

    async with AsyncSessionLocal() as db:
        await db.execute(text("UPDATE observation_posts SET content = 'правка' WHERE id = :i"), {"i": op_id})
        await db.commit()
    c2 = await _snapshot(client, w.lab_id, "после")
    d = await _diff(client, w.lab_id, c1["id"], c2["id"])
    changed = [r for r in d["records"] if r["kind"] == "post"]
    assert len(changed) == 1 and changed[0]["status"] == "changed"
    assert changed[0]["changed_fields"]["content"] == {"old": "пост", "new": "правка"}

    async with AsyncSessionLocal() as db:                                    # оригиналы исчезли физически
        await db.execute(text("DELETE FROM observation_posts WHERE id = :i"), {"i": op_id})
        await db.execute(text("DELETE FROM hypothesis_posts WHERE id = :i"), {"i": hp_id})
        await db.commit()
        assert await svc.verify_checkpoint(db, c1["id"]) == [] and await svc.verify_checkpoint(db, c2["id"]) == []
    old = {i.object_key: i.snapshot_data["content"] for i in await _items(c1["id"]) if i.kind == "post"}
    assert old == {f"post:hypothesis:{hp_id}": "первый", f"post:observation:{op_id}": "пост"}


from app.models.social import PostComment  # noqa: E402


@pytest.mark.asyncio
async def test_comments_on_hypothesis_posts_follow_the_post_survive_deletion_and_stay_hidden(client):
    w = await _world("owner")
    async with AsyncSessionLocal() as db:
        uid = w.uid["owner"]
        live = await _mk(db, Hypothesis, uid, name="H", **_lab_kw(w.lab_id))
        dead = await _mk(db, Hypothesis, uid, name="H-trash", **_lab_kw(w.lab_id))
        p_live = await _mk(db, HypothesisPost, uid, hypothesis_id=live.id, title="p", content="пост")
        p_dead = await _mk(db, HypothesisPost, uid, hypothesis_id=dead.id, title="q", content="пост2")
        c1 = await _mk(db, PostComment, uid, post_id=p_live.id, content="первый")
        c2 = await _mk(db, PostComment, uid, post_id=p_live.id, content="второй")
        await _mk(db, PostComment, uid, post_id=p_dead.id, content="в корзине")
        await db.execute(text("UPDATE hypotheses SET deleted_at = now() WHERE id = :i"), {"i": dead.id})
        await db.commit()
        hid, pid, ids = live.id, p_live.id, sorted([c1.id, c2.id])

    await _login(client, "owner")
    cp = await _snapshot(client, w.lab_id)
    rows = await _items(cp["id"])
    assert sorted(i.object_key for i in rows if i.kind == "post_comment") == sorted(f"post_comment:{i}" for i in ids)

    view = await _view(client, w.lab_id, cp["id"])
    node = next(n for n in view["entities"]["hypothesis"] if n["entity_id"] == hid)
    got = node["children"]["post_comment"]
    assert sorted(c["data"]["content"] for c in got) == ["второй", "первый"]
    assert {c["data"]["post_id"] for c in got} == {pid}                       # привязка к посту сохранена

    public = red.public_rows(rows)
    assert not [r for r in public if r.kind in ("post", "post_comment")]
    assert "author_id" not in json.dumps([r.snapshot_data for r in public])

    async with AsyncSessionLocal() as db:                                     # оригиналы исчезли физически
        await db.execute(text("DELETE FROM post_comments"))
        await db.commit()
        assert await svc.verify_checkpoint(db, cp["id"]) == []
    kept = [i.snapshot_data["content"] for i in await _items(cp["id"]) if i.kind == "post_comment"]
    assert sorted(kept) == ["второй", "первый"]
