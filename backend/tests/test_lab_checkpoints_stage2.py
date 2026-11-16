"""Снимки лабы, этап 2: дифф, публикация, вид для постороннего (белый список), файлы, verify, чистка блобов."""
import json
import os
import time
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
from sqlalchemy import inspect as sa_inspect, text

from app.core.entity_registry import ENTITY_MODELS
from app.db.session import AsyncSessionLocal
from app.models.entities import (
    EntityAttachment, EntityHypothesis, EntityImage, EntityStage, Hypothesis, Link, Observation, Prediction,
    Question, ResearchTask, Result, ResultSourceLink, ScaleDef, ScaleValue, SourceDocument, Worldview,
    HypStatusHistory, TaskScale, TaskScaleHypothesis,
)
from app.models.social import EntityComment, Lab, LabMember
from app.services import checkpoint_redaction as red
from app.services import lab_checkpoints as svc
from app.services.checkpoint_diff import diff_items
from app.services.checkpoint_gc import run_checkpoint_blob_gc
from tests.conftest import create_test_user
from tests.test_undo import _login
from tests.test_lab_checkpoints import (  # noqa: F401  (_dirs — фикстура: подхватывается по имени)
    _dirs, _items, _lab, _lab_kw, _mk, _snapshot, _url, _view, _world,
)

PUBLIC_META_KEYS = {"id", "lab_id", "title", "created_at", "published_at", "schema_version", "commit_hash"}
FORBIDDEN_KEYS = {"user_id", "author_id", "author", "owner_id", "created_by", "created_by_username", "published_by",
                  "tag_user_id", "tag_id", "owner_username"}


def _all_keys(o):
    if isinstance(o, dict):
        for k, v in o.items():
            yield k
            yield from _all_keys(v)
    elif isinstance(o, list):
        for v in o:
            yield from _all_keys(v)


def _diff_url(lab_id, a, b):
    return _url(lab_id, f"/diff?from={a}&to={b}")


async def _diff(client, lab_id, a, b):
    r = await client.get(_diff_url(lab_id, a, b))
    assert r.status_code == 200, r.text
    return r.json()


def _by_entity(diff, etype="observation"):
    return {r["entity_id"]: r for r in diff["records"] if r["kind"] == "entity" and r["entity_type"] == etype}


async def _publish(client, lab_id, cid, value=True):
    return await client.patch(_url(lab_id, f"/{cid}/publish"), json={"is_published": value})


# ── дифф ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_diff_classifies_added_removed_trashed_restored_changed(client):
    w = await _world("owner")
    owner = w.uid["owner"]
    now = lambda: datetime.now(timezone.utc)
    async with AsyncSessionLocal() as db:
        changed = await _mk(db, Observation, owner, title="A", text="a", **_lab_kw(w.lab_id))
        removed = await _mk(db, Observation, owner, title="R", text="r", **_lab_kw(w.lab_id))
        trashed = await _mk(db, Observation, owner, title="T", text="t", **_lab_kw(w.lab_id))
        restored = await _mk(db, Observation, owner, title="S", text="s", deleted_at=now(), **_lab_kw(w.lab_id))
        same = await _mk(db, Observation, owner, title="same", text="same", **_lab_kw(w.lab_id))
        await _mk(db, EntityComment, owner, entity_type="observation", entity_id=removed.id, stance="confirm", content="уйдёт вместе с записью")
        await db.commit()
        ids = dict(changed=changed.id, removed=removed.id, trashed=trashed.id, restored=restored.id, same=same.id)
    await _login(client, "owner")
    c1 = await _snapshot(client, w.lab_id)

    async with AsyncSessionLocal() as db:
        (await db.get(Observation, ids["changed"])).title = "B"
        await db.delete(await db.get(Observation, ids["removed"]))
        (await db.get(Observation, ids["trashed"])).deleted_at = now()
        (await db.get(Observation, ids["restored"])).deleted_at = None
        added = await _mk(db, Observation, owner, title="N", text="n", **_lab_kw(w.lab_id))
        late = await _mk(db, Observation, owner, title="L", text="l", deleted_at=now(), **_lab_kw(w.lab_id))
        await _mk(db, EntityComment, owner, entity_type="observation", entity_id=ids["changed"], stance="confirm", content="новый коммент")
        await db.commit()
        added_id, late_id = added.id, late.id
    c2 = await _snapshot(client, w.lab_id)

    d = await _diff(client, w.lab_id, c1["id"], c2["id"])
    got = _by_entity(d)
    assert {i: r["status"] for i, r in got.items()} == {
        ids["changed"]: "changed", ids["removed"]: "removed", ids["trashed"]: "trashed",
        ids["restored"]: "restored", added_id: "added", late_id: "trashed"}
    assert ids["same"] not in got
    assert got[ids["changed"]]["changed_fields"] == {"title": {"old": "A", "new": "B"}}     # updated_at в изменениях нет
    assert (got[ids["restored"]]["from_state"], got[ids["restored"]]["to_state"]) == ("trashed", "live")
    assert (got[late_id]["from_state"], got[late_id]["to_state"]) == ("absent", "trashed")
    assert (got[ids["changed"]]["label"], got[added_id]["label"], got[ids["removed"]]["label"]) == ("B", "N", "R")
    comments = [(r["status"], r["entity_id"], r["data"]["content"]) for r in d["records"] if r["kind"] == "comment"]
    assert comments == [("added", ids["changed"], "новый коммент")]    # комментарий удалённой записи отдельной строкой не идёт
    assert d["summary"] == {"changed": 1, "removed": 1, "trashed": 2, "restored": 1, "added": 2}

    back = await _diff(client, w.lab_id, c2["id"], c1["id"])
    assert {i: r["status"] for i, r in _by_entity(back).items()} == {
        ids["changed"]: "changed", ids["removed"]: "added", ids["trashed"]: "restored",
        ids["restored"]: "trashed", added_id: "removed", late_id: "removed"}
    assert _by_entity(back)[ids["changed"]]["changed_fields"] == {"title": {"old": "B", "new": "A"}}
    assert [(r["status"], r["entity_id"]) for r in back["records"] if r["kind"] == "comment"] == [("removed", ids["changed"])]


@pytest.mark.asyncio
async def test_diff_validation_and_isolation(client):
    w = await _world("owner")
    async with AsyncSessionLocal() as db:
        other = await _lab(db, w.uid["owner"])
        await db.commit()
        other_id = other.id
    await _login(client, "owner")
    mine, theirs = await _snapshot(client, w.lab_id), await _snapshot(client, other_id)
    assert (await client.get(_diff_url(w.lab_id, mine["id"], theirs["id"]))).status_code == 404
    assert (await client.get(_diff_url(w.lab_id, mine["id"], 99999))).status_code == 404
    assert (await client.get(_url(w.lab_id, f"/diff?from={mine['id']}"))).status_code == 422
    same = await _diff(client, w.lab_id, mine["id"], mine["id"])
    assert same["records"] == [] and same["summary"] == {}


def _it(kind, key, data=None, etype="observation", eid=1, blob=None):
    return SimpleNamespace(kind=kind, object_key=key, entity_type=etype, entity_id=eid,
                           snapshot_data=data or {}, blob_sha256=blob, blob_size=None)


def test_pure_diff_lifecycle_table():
    live = lambda d=None: _it("entity", "entity:observation:1", d or {})
    trashed = _it("trashed", "trashed:observation:1", {"entity_type": "observation", "entity_id": 1})

    def status(a, b):
        recs = diff_items(a, b)
        return recs[0]["status"] if recs else None

    assert status([], [live()]) == "added"
    assert status([live()], []) == "removed"
    assert status([live()], [trashed]) == "trashed"
    assert status([trashed], [live()]) == "restored"
    assert status([trashed], []) == "removed"
    assert status([], [trashed]) == "trashed"
    assert status([trashed], [trashed]) is None
    assert status([live({"title": "x"})], [live({"title": "x"})]) is None
    assert status([live({"title": "x", "updated_at": "1"})], [live({"title": "x", "updated_at": "2"})]) is None


def test_pure_diff_files_scale_values_and_result_children():
    h1, h2 = "1" * 64, "2" * 64
    [rec] = diff_items([_it("attachment", "attachment:5", {"filename": "a"}, eid=2, blob=h1)],
                       [_it("attachment", "attachment:5", {"filename": "a"}, eid=2, blob=h2)])
    assert rec["status"] == "changed" and rec["blob"] == {"old": h1, "new": h2} and rec["changed_fields"] == {}
    [rec] = diff_items([_it("scale_value", "scale_value:observation:1:7:importance", {"value": 3.0})],
                       [_it("scale_value", "scale_value:observation:1:7:importance", {"value": 4.0})])
    assert rec["changed_fields"] == {"value": {"old": 3.0, "new": 4.0}}
    res = _it("result", "result:9", {"title": "R"}, etype="result", eid=9)
    link = _it("result_source_link", "result_source_link:9:3", {"result_id": 9}, etype="result", eid=9)
    assert [(r["kind"], r["status"]) for r in diff_items([], [res, link])] == [("result", "added")]


# ── белый список ─────────────────────────────────────────────────────────────

SCHEMA_MODELS = {
    "lab": Lab, "observation": Observation, "hypothesis": Hypothesis, "prediction": Prediction, "worldview": Worldview,
    "question": Question, "task": ResearchTask, "result": Result, "result_source_link": ResultSourceLink, "link": Link,
    "entity_hypothesis": EntityHypothesis, "source": SourceDocument, "stage": EntityStage, "scale_def": ScaleDef,
    "scale_value": ScaleValue, "task_scale": TaskScale, "task_scale_hypothesis": TaskScaleHypothesis,
    "hyp_status_history": HypStatusHistory,
}


def test_every_model_column_is_decided():
    assert set(red.PUBLIC_FIELDS) == set(red.HIDDEN_FIELDS) == set(SCHEMA_MODELS) | {"tag"}
    for schema, model in SCHEMA_MODELS.items():
        cols = {a.key for a in sa_inspect(model).mapper.column_attrs}
        pub, hid = set(red.PUBLIC_FIELDS[schema]), set(red.HIDDEN_FIELDS[schema])
        assert not (pub & hid), schema
        assert pub | hid == cols, f"{schema}: нет решения для {sorted(cols - pub - hid)}, лишнее {sorted((pub | hid) - cols)}"
    assert red.PUBLIC_FIELDS["tag"] | set(red.HIDDEN_FIELDS["tag"]) == {"entity_type", "entity_id", "name", "tag_id", "tag_user_id"}


def test_every_item_kind_is_visible_or_explicitly_hidden():
    kinds = svc.STRUCTURAL_KINDS | svc.INCLUDED_CHILD_KINDS
    for kind in kinds - {"entity"}:
        assert kind in red.HIDDEN_KINDS or kind in red.PUBLIC_FIELDS, kind
    for etype in ENTITY_MODELS:
        assert red.schema_of("entity", etype) == etype
    assert red.schema_of("entity", "future_type") is None            # неизвестное — скрыто
    assert set(red.HIDDEN_KINDS) <= kinds


# ── вид и список для постороннего ────────────────────────────────────────────

@pytest.mark.asyncio
async def test_outsider_sees_only_whitelisted_published_view(client):
    w = await _world("owner", "member", public=True)
    async with AsyncSessionLocal() as db:
        owner = w.uid["owner"]
        obs = await _mk(db, Observation, owner, title="Видимое", text="видимый текст", author="SENT-AUTHOR", **_lab_kw(w.lab_id))
        await _mk(db, EntityComment, w.uid["member"], entity_type="observation", entity_id=obs.id, stance="confirm", content="SENT-COMMENT")
        await _mk(db, EntityImage, owner, entity_type="observation", entity_id=obs.id, filename="SENT-IMG.png", thumb_filename="t.png")
        await _mk(db, EntityAttachment, owner, entity_type="observation", entity_id=obs.id, kind="code", filename="SENT-ATT-NAME.py",
                  mime_type="text/plain", size_bytes=3, storage_path="none.txt", language=None, text_content="SENT-ATT-TEXT")
        await _mk(db, SourceDocument, owner, entity_type="observation", entity_id=obs.id, url="https://example.test",
                  title="источник", error_msg="SENT-ERR")
        await _mk(db, Result, owner, lab_id=w.lab_id, title="Результат", body="тело", visibility="lab")
        await db.commit()
    await _login(client, "owner")
    cp = await _snapshot(client, w.lab_id)
    assert (await _publish(client, w.lab_id, cp["id"])).status_code == 200

    await _login(client, "member")
    member_view = json.dumps(await _view(client, w.lab_id, cp["id"]), ensure_ascii=False)
    assert all(s in member_view for s in ("SENT-AUTHOR", "SENT-COMMENT", "SENT-IMG", "SENT-ATT-TEXT"))   # участник видит всё

    client.cookies.clear()                                                    # гость
    r = await client.get(_url(w.lab_id, f"/{cp['id']}"))
    assert r.status_code == 200, r.text
    body = r.json()
    dumped = json.dumps(body, ensure_ascii=False)
    assert not [s for s in ("SENT-AUTHOR", "SENT-COMMENT", "SENT-IMG", "SENT-ATT-NAME", "SENT-ATT-TEXT", "SENT-ERR") if s in dumped]
    assert FORBIDDEN_KEYS.isdisjoint(set(_all_keys(body))), FORBIDDEN_KEYS & set(_all_keys(body))
    assert body["audience"] == "public" and set(body["checkpoint"]) == PUBLIC_META_KEYS and body["trashed"] == []
    node = body["entities"]["observation"][0]
    assert node["data"]["title"] == "Видимое" and set(node["data"]) <= red.PUBLIC_FIELDS["observation"]
    assert set(node["children"]) == {"source"}                                # комментарии, картинки, вложения скрыты
    assert body["results"][0]["data"]["title"] == "Результат"

    listed = (await client.get(_url(w.lab_id))).json()
    assert len(listed) == 1 and set(listed[0]) == PUBLIC_META_KEYS            # регрессия: раньше торчали created_by, parent_id

    async with AsyncSessionLocal() as db:                                     # публичность лабы снята — снимок снова скрыт
        (await db.get(Lab, w.lab_id)).is_public = False
        await db.commit()
    assert (await client.get(_url(w.lab_id, f"/{cp['id']}"))).status_code == 404
    assert (await client.get(_url(w.lab_id))).status_code == 404


@pytest.mark.asyncio
async def test_outsider_diff_needs_both_published_and_hides_private_fields(client):
    w = await _world("owner", public=True)
    async with AsyncSessionLocal() as db:
        owner = w.uid["owner"]
        obs = await _mk(db, Observation, owner, title="T1", text="t", author="SENT-AUTHOR-1", **_lab_kw(w.lab_id))
        await db.commit()
        obs_id = obs.id
    await _login(client, "owner")
    c1 = await _snapshot(client, w.lab_id)
    async with AsyncSessionLocal() as db:
        o = await db.get(Observation, obs_id)
        o.title, o.author = "T2", "SENT-AUTHOR-2"
        await _mk(db, EntityComment, owner, entity_type="observation", entity_id=obs_id, stance="confirm", content="SENT-COMMENT-2")
        await db.commit()
    c2 = await _snapshot(client, w.lab_id)

    client.cookies.clear()
    assert (await client.get(_diff_url(w.lab_id, c1["id"], c2["id"]))).status_code == 404       # ничего не опубликовано
    await _login(client, "owner")
    assert (await _publish(client, w.lab_id, c1["id"])).status_code == 200
    client.cookies.clear()
    assert (await client.get(_diff_url(w.lab_id, c1["id"], c2["id"]))).status_code == 404       # опубликован только один
    await _login(client, "owner")
    assert (await _publish(client, w.lab_id, c2["id"])).status_code == 200

    member = await _diff(client, w.lab_id, c1["id"], c2["id"])
    assert set(_by_entity(member)[obs_id]["changed_fields"]) == {"title", "author"}
    assert [r["kind"] for r in member["records"] if r["kind"] == "comment"] == ["comment"]

    client.cookies.clear()
    pub = await _diff(client, w.lab_id, c1["id"], c2["id"])
    assert pub["audience"] == "public"
    assert _by_entity(pub)[obs_id]["changed_fields"] == {"title": {"old": "T1", "new": "T2"}}
    assert not [r for r in pub["records"] if r["kind"] == "comment"]
    assert "SENT-" not in json.dumps(pub, ensure_ascii=False)
    assert FORBIDDEN_KEYS.isdisjoint(set(_all_keys(pub))) and set(pub["from"]) == PUBLIC_META_KEYS


# ── публикация ───────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_publish_permissions_idempotency_and_public_lab_requirement(client):
    w = await _world("owner", "admin", "member", public=True)
    await create_test_user("outsider")
    async with AsyncSessionLocal() as db:
        (await db.get(LabMember, (w.lab_id, w.uid["admin"]))).role = "admin"
        await db.commit()
    await _login(client, "owner")
    cp = await _snapshot(client, w.lab_id)

    await _login(client, "member")
    assert (await _publish(client, w.lab_id, cp["id"])).status_code == 403          # обычный участник
    await _login(client, "outsider")
    assert (await _publish(client, w.lab_id, cp["id"])).status_code == 403          # не участник публичной лабы
    client.cookies.clear()
    assert (await _publish(client, w.lab_id, cp["id"])).status_code == 401          # гость

    await _login(client, "admin")
    first = await _publish(client, w.lab_id, cp["id"])
    assert first.status_code == 200 and first.json()["is_published"] is True and first.json()["published_at"]
    again = await _publish(client, w.lab_id, cp["id"])
    assert again.json()["published_at"] == first.json()["published_at"]               # повтор безвреден, время не сдвигается
    assert (await client.patch(_url(w.lab_id, f"/{cp['id']}/publish"), json={"is_published": "maybe"})).status_code == 422
    assert (await client.patch(_url(w.lab_id, f"/{cp['id']}/publish"), json={})).status_code == 422
    assert (await _publish(client, w.lab_id, 99999)).status_code == 404

    client.cookies.clear()
    assert len((await client.get(_url(w.lab_id))).json()) == 1
    await _login(client, "owner")
    assert (await _publish(client, w.lab_id, cp["id"], False)).json()["is_published"] is False
    client.cookies.clear()
    assert (await client.get(_url(w.lab_id))).json() == []
    assert (await client.get(_url(w.lab_id, f"/{cp['id']}"))).status_code == 404

    closed = await _world("owner2")
    await _login(client, "owner2")
    c = await _snapshot(client, closed.lab_id)
    r = await _publish(client, closed.lab_id, c["id"])
    assert r.status_code == 409 and r.json()["detail"] == {"code": "lab_not_public"}


# ── файлы и проверка ─────────────────────────────────────────────────────────

async def _attachment_world(_dirs):
    (_dirs.atts / "u1.txt").write_bytes(b"payload")
    w = await _world("owner", public=True)
    async with AsyncSessionLocal() as db:
        owner = w.uid["owner"]
        obs = await _mk(db, Observation, owner, title="o", text="o", **_lab_kw(w.lab_id))
        await _mk(db, EntityAttachment, owner, entity_type="observation", entity_id=obs.id, kind="code", filename="report.txt",
                  mime_type="text/plain", size_bytes=7, storage_path="u1.txt", language=None, text_content="payload")
        await db.commit()
    return w


@pytest.mark.asyncio
async def test_member_downloads_verified_snapshot_file_others_cannot(client, _dirs):
    w = await _attachment_world(_dirs)
    await create_test_user("outsider")
    await _login(client, "owner")
    cp = await _snapshot(client, w.lab_id)
    items = await _items(cp["id"])
    att = next(i for i in items if i.kind == "attachment")
    ent = next(i for i in items if i.kind == "entity")
    blob = _dirs.blobs / att.blob_sha256[:2] / att.blob_sha256

    r = await client.get(_url(w.lab_id, f"/{cp['id']}/files/{att.id}"))
    assert r.status_code == 200 and r.content == b"payload"
    assert "attachment" in r.headers["content-disposition"] and "report.txt" in r.headers["content-disposition"]
    assert r.headers["x-content-type-options"] == "nosniff" and r.headers["content-type"].startswith("application/octet-stream")

    c2 = await _snapshot(client, w.lab_id)
    assert (await client.get(_url(w.lab_id, f"/{c2['id']}/files/{att.id}"))).status_code == 404     # элемент другого снимка
    assert (await client.get(_url(w.lab_id, f"/{cp['id']}/files/{ent.id}"))).status_code == 404     # не файл

    assert (await _publish(client, w.lab_id, cp["id"])).status_code == 200
    await _login(client, "outsider")
    assert (await client.get(_url(w.lab_id, f"/{cp['id']}/files/{att.id}"))).status_code == 404     # посторонним файлов нет
    client.cookies.clear()
    assert (await client.get(_url(w.lab_id, f"/{cp['id']}/files/{att.id}"))).status_code == 401

    await _login(client, "owner")
    blob.write_bytes(b"TAMPERED")
    bad = await client.get(_url(w.lab_id, f"/{cp['id']}/files/{att.id}"))
    assert bad.status_code == 409 and bad.json()["detail"] == {"code": "blob_corrupted"}              # подмена не отдаётся
    blob.unlink()
    gone = await client.get(_url(w.lab_id, f"/{cp['id']}/files/{att.id}"))
    assert gone.status_code == 404 and gone.json()["detail"] == {"code": "blob_missing"}


@pytest.mark.asyncio
async def test_verify_endpoint_reports_tampering_and_is_members_only(client, _dirs):
    w = await _attachment_world(_dirs)
    await create_test_user("outsider")
    await _login(client, "owner")
    cp = await _snapshot(client, w.lab_id)
    ok = await client.get(_url(w.lab_id, f"/{cp['id']}/verify"))
    assert ok.status_code == 200 and ok.json() == {"ok": True, "problems": [], "commit_hash": cp["commit_hash"]}

    for p in _dirs.blobs.rglob("*"):
        if p.is_file():
            p.unlink()
    assert (await client.get(_url(w.lab_id, f"/{cp['id']}/verify"))).json()["ok"] is True            # без files — файлы не проверяются
    with_files = (await client.get(_url(w.lab_id, f"/{cp['id']}/verify?files=true"))).json()
    assert with_files["ok"] is False and with_files["problems"][0].startswith("blob:")

    async with AsyncSessionLocal() as db:
        await db.execute(text("UPDATE lab_checkpoint_items SET snapshot_data = jsonb_set(snapshot_data, '{title}', '\"hacked\"') "
                              "WHERE checkpoint_id = :c AND kind = 'entity'"), {"c": cp["id"]})
        await db.commit()
    bad = (await client.get(_url(w.lab_id, f"/{cp['id']}/verify"))).json()
    assert bad["ok"] is False and "tree" in bad["problems"]

    await _login(client, "outsider")
    assert (await client.get(_url(w.lab_id, f"/{cp['id']}/verify"))).status_code == 404
    client.cookies.clear()
    assert (await client.get(_url(w.lab_id, f"/{cp['id']}/verify"))).status_code == 401


# ── чистка блобов ────────────────────────────────────────────────────────────

def _age(path, days):
    t = time.time() - days * 86400
    os.utime(path, (t, t))


@pytest.mark.asyncio
async def test_blob_gc_removes_only_old_unreferenced_files_and_leftovers(client, _dirs):
    w = await _attachment_world(_dirs)
    await _login(client, "owner")
    cp = await _snapshot(client, w.lab_id)
    kept = next(i for i in await _items(cp["id"]) if i.kind == "attachment").blob_sha256
    kept_path = _dirs.blobs / kept[:2] / kept
    old_orphan = _dirs.blobs / "ab" / ("ab" * 32)
    new_orphan = _dirs.blobs / "cd" / ("cd" * 32)
    old_tmp = _dirs.blobs / ".tmp-leftover"
    for p in (old_orphan, new_orphan, old_tmp):
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(b"x")
    for p in (old_orphan, old_tmp, kept_path):
        _age(p, 3)

    assert await run_checkpoint_blob_gc() == 2
    assert not old_orphan.exists() and not old_tmp.exists()
    assert new_orphan.exists()                    # свежий: возможно, снимок ещё пишется
    assert kept_path.exists()                     # на него ссылается снимок, даже старый
    assert not (_dirs.blobs / "ab").exists()      # пустая подпапка убрана
    assert await run_checkpoint_blob_gc() == 0


@pytest.mark.asyncio
async def test_store_blob_refreshes_old_unreferenced_blob_so_gc_keeps_it(tmp_path, _dirs):
    src = tmp_path / "f.bin"
    src.write_bytes(b"same")
    sha, _ = svc.store_blob(str(src))
    blob = _dirs.blobs / sha[:2] / sha
    _age(blob, 5)                                  # осиротел и состарился (лабу удалили)
    old_mtime = blob.stat().st_mtime
    assert svc.store_blob(str(src))[0] == sha      # новый снимок сослался на тот же файл
    assert blob.stat().st_mtime > old_mtime + 86400
    assert await run_checkpoint_blob_gc() == 0 and blob.exists()
