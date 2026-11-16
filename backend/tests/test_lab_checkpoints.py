"""Снимки лабы, этап 1: состав, копия переживает удаление, файлы по содержимому, хеш-цепочка и её
проверка, права, лимиты, ограничения БД. Данные создаются прямыми вставками (_mk подставляет
обязательные колонки по схеме), запросы — через настоящий HTTP."""
import hashlib
import itertools
import json
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import DBAPIError, IntegrityError

from app.core.entity_registry import POLYMORPHIC_CHILD_MODELS
from app.db.session import AsyncSessionLocal
from app.models.checkpoints import LabCheckpoint, LabCheckpointItem
from app.models.entities import (
    EntityAttachment, EntityImage, EntityReflection, EntityStage, EntityTag, Hypothesis, Link, Observation,
    Prediction, Question, ResearchTask, Result, ScaleDef, ScaleValue, SourceDocument, Tag, Worldview,
)
from app.models.social import EntityComment, Lab, LabMember
from app.models.user import User
from app.services import attachment_storage, image_processing
from app.services import lab_checkpoints as svc
from app.services.row_snapshot import serialize_row
from tests.conftest import create_test_user
from tests.test_undo import _login

_seq = itertools.count(1)


def _fill(model, uid, **given):
    """Значения для всех обязательных колонок без умолчаний — чтобы тесты не зависели от схемы."""
    vals = dict(given)
    cols = model.__table__.columns
    if "slug" in cols and "slug" not in vals:
        vals["slug"] = f"s{next(_seq)}-{model.__tablename__}"
    for name in ("user_id", "owner_id", "author_id"):
        if name in cols and name not in vals:
            vals[name] = uid
    for col in cols:
        if col.name in vals or (col.primary_key and col.name == "id"):
            continue
        if col.nullable or col.default is not None or col.server_default is not None:
            continue
        try:
            py = col.type.python_type
        except NotImplementedError:
            py = str
        vals[col.name] = ("x" if py is str else 0 if py is int else 0.0 if py is float else False if py is bool
                          else datetime.now(timezone.utc) if py is datetime else {} if py is dict else [] if py is list else "x")
    return vals


async def _mk(db, model, uid, **given):
    obj = model(**_fill(model, uid, **given))
    db.add(obj)
    await db.flush()
    return obj


async def _lab(db, owner_uid, *, public=False, others=()):
    lab = await _mk(db, Lab, owner_uid, name="L", description="d", is_public=public)
    db.add(LabMember(lab_id=lab.id, user_id=owner_uid, role="owner"))
    for uid in others:
        db.add(LabMember(lab_id=lab.id, user_id=uid, role="member"))
    await db.flush()
    return lab


async def _uids(db, *names):
    return {n: (await db.execute(select(User.id).where(User.username == n))).scalar_one() for n in names}


async def _world(*names, public=False):
    for n in names:
        await create_test_user(n)
    async with AsyncSessionLocal() as db:
        uid = await _uids(db, *names)
        lab = await _lab(db, uid[names[0]], public=public, others=[uid[n] for n in names[1:]])
        await db.commit()
        return SimpleNamespace(lab_id=lab.id, uid=uid)


def _lab_kw(lab_id):
    return dict(lab_id=lab_id, visibility="lab")


async def _six(db, uid, lab_id):
    kw = _lab_kw(lab_id)
    return {
        "observation": await _mk(db, Observation, uid, title="O", text="o", **kw),
        "hypothesis": await _mk(db, Hypothesis, uid, name="H", **kw),
        "prediction": await _mk(db, Prediction, uid, title="P", text="p", **kw),
        "worldview": await _mk(db, Worldview, uid, belief="W", **kw),
        "question": await _mk(db, Question, uid, title="Q", **kw),
        "task": await _mk(db, ResearchTask, uid, name="T", **kw),
    }


def _url(lab_id, tail=""):
    return f"/api/v1/labs/{lab_id}/checkpoints{tail}"


async def _snapshot(client, lab_id, title=None):
    r = await client.post(_url(lab_id), json={"title": title})
    assert r.status_code == 201, r.text
    return r.json()


async def _view(client, lab_id, cid):
    r = await client.get(_url(lab_id, f"/{cid}"))
    assert r.status_code == 200, r.text
    return r.json()


async def _items(cid):
    async with AsyncSessionLocal() as db:
        return (await db.execute(select(LabCheckpointItem).where(LabCheckpointItem.checkpoint_id == cid)
                                 .order_by(LabCheckpointItem.object_key))).scalars().all()


@pytest.fixture(autouse=True)
def _dirs(tmp_path, monkeypatch):
    d = SimpleNamespace(blobs=tmp_path / "blobs", images=tmp_path / "images", atts=tmp_path / "atts")
    d.images.mkdir(); d.atts.mkdir()
    monkeypatch.setattr(svc, "CHECKPOINT_BLOB_DIR", str(d.blobs))
    monkeypatch.setattr(image_processing, "IMAGES_DIR", str(d.images))
    monkeypatch.setattr(attachment_storage, "ATTACHMENTS_DIR", str(d.atts))
    return d


def _blob_files(d):
    return sorted(p.name for p in d.blobs.rglob("*") if p.is_file() and not p.name.startswith(".tmp-")) if d.blobs.exists() else []


# ── состав ───────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_snapshot_has_live_entities_trash_markers_and_nothing_foreign(client):
    w = await _world("owner")
    async with AsyncSessionLocal() as db:
        owner = w.uid["owner"]
        six = await _six(db, owner, w.lab_id)
        gone = await _mk(db, Observation, owner, title="gone", text="g", deleted_at=datetime.now(timezone.utc), **_lab_kw(w.lab_id))
        other_lab = await _lab(db, owner)
        foreign = await _mk(db, Observation, owner, title="foreign", text="f", **_lab_kw(other_lab.id))
        personal = await _mk(db, Observation, owner, title="personal", text="p")
        await db.commit()
        ids = {t: o.id for t, o in six.items()}
        gone_id = gone.id
        not_included = {foreign.id, personal.id}
    await _login(client, "owner")
    cp = await _snapshot(client, w.lab_id, "до эксперимента")
    assert cp["title"] == "до эксперимента" and cp["parent_id"] is None and cp["created_by_username"] == "owner"

    view = await _view(client, w.lab_id, cp["id"])
    assert {t: [n["entity_id"] for n in nodes] for t, nodes in view["entities"].items()} == {t: [i] for t, i in ids.items()}
    assert not_included.isdisjoint({n["entity_id"] for n in view["entities"]["observation"]})
    assert view["trashed"] == [{"entity_type": "observation", "entity_id": gone_id}]
    assert view["entities"]["observation"][0]["data"]["title"] == "O"
    assert view["lab"]["data"]["name"] == "L"
    assert view["audience"] == "member"


@pytest.mark.asyncio
async def test_results_links_tags_and_scales_follow_the_rules(client):
    w = await _world("owner", "member")
    async with AsyncSessionLocal() as db:
        owner, member = w.uid["owner"], w.uid["member"]
        o1 = await _mk(db, Observation, owner, title="o1", text="1", **_lab_kw(w.lab_id))
        o2 = await _mk(db, Observation, owner, title="o2", text="2", **_lab_kw(w.lab_id))
        o3 = await _mk(db, Observation, owner, title="trashed", text="3", deleted_at=datetime.now(timezone.utc), **_lab_kw(w.lab_id))
        personal = await _mk(db, Observation, owner, title="personal", text="p")
        await _mk(db, Link, owner, from_type="observation", from_id=o1.id, to_type="observation", to_id=o2.id, link_type="связано")
        await _mk(db, Link, owner, from_type="observation", from_id=o1.id, to_type="observation", to_id=personal.id, link_type="связано")
        await _mk(db, Link, owner, from_type="observation", from_id=o1.id, to_type="observation", to_id=o3.id, link_type="связано")
        r_lab = await _mk(db, Result, owner, lab_id=w.lab_id, title="R", visibility="lab")
        await _mk(db, Result, owner, lab_id=w.lab_id, title="draft", visibility="private")
        sd = await _mk(db, ScaleDef, owner, entity_type="observation", name="Моя шкала")
        await _mk(db, ScaleValue, owner, user_id=owner, entity_type="observation", entity_id=o1.id, scale_id=f"custom_{sd.id}", value=7.5)
        await _mk(db, ScaleValue, owner, user_id=member, entity_type="observation", entity_id=o1.id, scale_id=f"custom_{sd.id}", value=1.5)
        tag = await _mk(db, Tag, owner, name="важное")
        db.add(EntityTag(entity_type="observation", entity_id=o1.id, tag_id=tag.id))
        await db.commit()
        o1_id, o2_id, r_id = o1.id, o2.id, r_lab.id
    await _login(client, "member")
    view = await _view(client, w.lab_id, (await _snapshot(client, w.lab_id))["id"])

    assert [(l["from_id"], l["to_id"]) for l in view["links"]] == [(o1_id, o2_id)]
    assert [r["entity_id"] for r in view["results"]] == [r_id]
    node = next(n for n in view["entities"]["observation"] if n["entity_id"] == o1_id)
    assert [c["data"]["value"] for c in node["children"]["scale_value"]] == [7.5]      # чужое значение шкалы не входит
    assert [c["data"]["name"] for c in node["children"]["tag"]] == ["важное"]          # тег — по имени, а не по id
    assert [d["name"] for d in view["scale_defs"]] == ["Моя шкала"]


@pytest.mark.asyncio
async def test_personal_and_derived_children_are_excluded(client):
    w = await _world("owner")
    async with AsyncSessionLocal() as db:
        owner = w.uid["owner"]
        obs = await _mk(db, Observation, owner, title="o", text="o", **_lab_kw(w.lab_id))
        await _mk(db, EntityComment, owner, entity_type="observation", entity_id=obs.id, stance="confirm", content="обычный")
        await _mk(db, EntityComment, owner, entity_type="observation", entity_id=obs.id, stance="confirm", content="личный вывод", source="reflection_followup")
        await _mk(db, EntityReflection, owner, entity_type="observation", entity_id=obs.id, stage="creation", raw_dialogue_text="личное")
        await db.commit()
    await _login(client, "owner")
    cp = await _snapshot(client, w.lab_id)
    items = await _items(cp["id"])
    allowed = svc.INCLUDED_CHILD_KINDS | svc.STRUCTURAL_KINDS
    assert {i.kind for i in items} <= allowed
    comments = [i.snapshot_data["content"] for i in items if i.kind == "comment"]
    assert comments == ["обычный"]
    assert "личное" not in json.dumps([i.snapshot_data for i in items], ensure_ascii=False)


def test_every_polymorphic_child_kind_is_decided():
    assert set(POLYMORPHIC_CHILD_MODELS) == svc.INCLUDED_CHILD_KINDS | set(svc.EXCLUDED_CHILD_KINDS)
    assert svc.INCLUDED_CHILD_KINDS.isdisjoint(svc.EXCLUDED_CHILD_KINDS)


@pytest.mark.asyncio
async def test_stage_of_the_lab_itself_is_included(client):
    w = await _world("owner")
    async with AsyncSessionLocal() as db:
        await _mk(db, EntityStage, w.uid["owner"], entity_type="lab", entity_id=w.lab_id, current_stage="research")
        await db.commit()
    await _login(client, "owner")
    view = await _view(client, w.lab_id, (await _snapshot(client, w.lab_id))["id"])
    assert [c["data"]["current_stage"] for c in view["lab"]["children"]["stage"]] == ["research"]


# ── копия переживает удаление ─────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_snapshot_survives_soft_and_hard_delete_of_originals(client):
    w = await _world("owner")
    async with AsyncSessionLocal() as db:
        owner = w.uid["owner"]
        a = await _mk(db, Observation, owner, title="A", text="a", **_lab_kw(w.lab_id))
        b = await _mk(db, Observation, owner, title="B", text="b", **_lab_kw(w.lab_id))
        await _mk(db, EntityComment, owner, entity_type="observation", entity_id=a.id, stance="confirm", content="коммент к A")
        await _mk(db, SourceDocument, owner, entity_type="observation", entity_id=a.id, url="https://example.test", title="src")
        await db.commit()
        a_id, b_id = a.id, b.id
    await _login(client, "owner")
    cp = await _snapshot(client, w.lab_id)

    async with AsyncSessionLocal() as db:
        (await db.get(Observation, b_id)).deleted_at = datetime.now(timezone.utc)   # в корзину
        await db.delete(await db.get(Observation, a_id))                            # навсегда (каскад детей)
        await db.commit()
        assert await db.get(Observation, a_id) is None
        left = (await db.execute(select(EntityComment).where(EntityComment.entity_id == a_id))).scalars().all()
        assert left == []                                                           # оригиналы детей стёрты

    view = await _view(client, w.lab_id, cp["id"])
    nodes = {n["entity_id"]: n for n in view["entities"]["observation"]}
    assert set(nodes) == {a_id, b_id} and nodes[a_id]["data"]["title"] == "A"
    assert [c["data"]["content"] for c in nodes[a_id]["children"]["comment"]] == ["коммент к A"]
    assert [c["data"]["title"] for c in nodes[a_id]["children"]["source"]] == ["src"]
    assert view["trashed"] == []                                                    # на момент снимка запись была живой
    async with AsyncSessionLocal() as db:
        assert await svc.verify_checkpoint(db, cp["id"]) == []


# ── файлы ────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_files_are_copied_by_content_dedup_and_survive_original_removal(client, _dirs):
    (_dirs.atts / "u1.txt").write_bytes(b"hello")
    (_dirs.images / "i1.png").write_bytes(b"IMG")
    w = await _world("owner")
    async with AsyncSessionLocal() as db:
        owner = w.uid["owner"]
        obs = await _mk(db, Observation, owner, title="o", text="o", **_lab_kw(w.lab_id))
        await _mk(db, EntityAttachment, owner, entity_type="observation", entity_id=obs.id, kind="code", filename="a.txt",
                  mime_type="text/plain", size_bytes=5, storage_path="u1.txt", language=None, text_content="hello")
        await _mk(db, EntityImage, owner, entity_type="observation", entity_id=obs.id, filename="i1.png", thumb_filename="t1.png")
        await db.commit()
    await _login(client, "owner")
    cp = await _snapshot(client, w.lab_id)

    node = (await _view(client, w.lab_id, cp["id"]))["entities"]["observation"][0]["children"]
    att, img = node["attachment"][0], node["image"][0]
    assert att["blob_sha256"] == hashlib.sha256(b"hello").hexdigest() and att["blob_size"] == 5 and att["file_missing"] is False
    assert img["blob_sha256"] == hashlib.sha256(b"IMG").hexdigest()
    assert cp["blob_bytes"] == 8
    assert sorted(_blob_files(_dirs)) == sorted([att["blob_sha256"], img["blob_sha256"]])

    (_dirs.atts / "u1.txt").unlink()
    (_dirs.images / "i1.png").unlink()
    assert (_dirs.blobs / att["blob_sha256"][:2] / att["blob_sha256"]).read_bytes() == b"hello"   # копия пережила оригинал

    await _snapshot(client, w.lab_id)                                    # второй снимок тех же файлов... оригиналов уже нет
    assert len(_blob_files(_dirs)) == 2


@pytest.mark.asyncio
async def test_same_bytes_in_two_snapshots_are_stored_once(client, _dirs):
    (_dirs.atts / "u1.txt").write_bytes(b"same")
    w = await _world("owner")
    async with AsyncSessionLocal() as db:
        owner = w.uid["owner"]
        obs = await _mk(db, Observation, owner, title="o", text="o", **_lab_kw(w.lab_id))
        await _mk(db, EntityAttachment, owner, entity_type="observation", entity_id=obs.id, kind="code", filename="a.txt",
                  mime_type="text/plain", size_bytes=4, storage_path="u1.txt", language=None, text_content="same")
        await db.commit()
    await _login(client, "owner")
    await _snapshot(client, w.lab_id)
    await _snapshot(client, w.lab_id)
    assert _blob_files(_dirs) == [hashlib.sha256(b"same").hexdigest()]


@pytest.mark.asyncio
async def test_missing_or_unsafe_file_is_marked_not_fatal(client, _dirs):
    w = await _world("owner")
    async with AsyncSessionLocal() as db:
        owner = w.uid["owner"]
        obs = await _mk(db, Observation, owner, title="o", text="o", **_lab_kw(w.lab_id))
        await _mk(db, EntityImage, owner, entity_type="observation", entity_id=obs.id, filename="nope.png", thumb_filename="t.png")
        await _mk(db, EntityImage, owner, entity_type="observation", entity_id=obs.id, filename="../etc/passwd", thumb_filename="t.png")
        await db.commit()
    await _login(client, "owner")
    cp = await _snapshot(client, w.lab_id)
    images = (await _view(client, w.lab_id, cp["id"]))["entities"]["observation"][0]["children"]["image"]
    assert [(i["blob_sha256"], i["file_missing"]) for i in images] == [(None, True), (None, True)]
    assert cp["blob_bytes"] == 0 and _blob_files(_dirs) == []


# ── лимиты и валидация ───────────────────────────────────────────────────────



@pytest.mark.asyncio
async def test_too_large_snapshot_is_rejected_before_anything_is_written(client, monkeypatch, _dirs):
    (_dirs.atts / "big.bin").write_bytes(b"0123456789")
    monkeypatch.setattr(svc, "MAX_CHECKPOINT_BLOB_BYTES", 5)
    w = await _world("owner")
    async with AsyncSessionLocal() as db:
        owner = w.uid["owner"]
        obs = await _mk(db, Observation, owner, title="o", text="o", **_lab_kw(w.lab_id))
        await _mk(db, EntityAttachment, owner, entity_type="observation", entity_id=obs.id, kind="other", filename="big.bin",
                  mime_type="application/octet-stream", size_bytes=10, storage_path="big.bin", language=None)
        await db.commit()
    await _login(client, "owner")
    r = await client.post(_url(w.lab_id), json={})
    assert r.status_code == 409 and r.json()["detail"]["code"] == "checkpoint_too_large"
    assert r.json()["detail"]["bytes"] == 10 and r.json()["detail"]["limit"] == 5
    assert _blob_files(_dirs) == []
    assert (await client.get(_url(w.lab_id))).json() == []


@pytest.mark.asyncio
async def test_title_validation(client):
    w = await _world("owner")
    await _login(client, "owner")
    assert (await client.post(_url(w.lab_id), json={"title": "x" * 121})).status_code == 422
    assert (await client.post(_url(w.lab_id), json={"title": "a\x00b"})).status_code == 422
    assert (await client.post(_url(w.lab_id), json={"title": "a\nb"})).status_code == 422
    assert (await _snapshot(client, w.lab_id, "   "))["title"] is None
    assert (await _snapshot(client, w.lab_id, "  до удобрения  "))["title"] == "до удобрения"
    assert (await _snapshot(client, w.lab_id, "<b>как есть</b>"))["title"] == "<b>как есть</b>"   # хранится текстом, показывается текстом


# ── права ────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_permissions_members_outsiders_guests(client):
    w = await _world("owner", "member", public=True)
    await create_test_user("outsider")
    async with AsyncSessionLocal() as db:
        uid = await _uids(db, "owner")
        private = await _lab(db, uid["owner"], public=False)
        await db.commit()
        private_id = private.id

    await _login(client, "member")
    cp = await _snapshot(client, w.lab_id)                                    # любой участник
    assert len((await client.get(_url(w.lab_id))).json()) == 1

    await _login(client, "outsider")
    assert (await client.post(_url(w.lab_id), json={})).status_code == 403    # публичная лаба, но не участник
    assert (await client.post(_url(private_id), json={})).status_code == 404  # закрытую не подтверждаем
    assert (await client.get(_url(w.lab_id))).json() == []                    # неопубликованное не видно
    assert (await client.get(_url(w.lab_id, f"/{cp['id']}"))).status_code == 404
    assert (await client.get(_url(private_id))).status_code == 404

    client.cookies.clear()
    assert (await client.post(_url(w.lab_id), json={})).status_code == 401
    assert (await client.get(_url(w.lab_id))).json() == []
    assert (await client.get(_url(private_id))).status_code == 404
    assert (await client.get(_url(w.lab_id, f"/{cp['id']}"))).status_code == 404


@pytest.mark.asyncio
async def test_snapshot_of_another_lab_is_not_reachable_through_this_lab(client):
    w = await _world("owner")
    async with AsyncSessionLocal() as db:
        other = await _lab(db, w.uid["owner"])
        await db.commit()
        other_id = other.id
    await _login(client, "owner")
    cp = await _snapshot(client, other_id)
    assert (await client.get(_url(w.lab_id, f"/{cp['id']}"))).status_code == 404


# ── хеш-цепочка ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_hash_chain_matches_documented_algorithm_and_detects_tampering(client):
    w = await _world("owner")
    async with AsyncSessionLocal() as db:
        owner = w.uid["owner"]
        obs = await _mk(db, Observation, owner, title="O", text="o", **_lab_kw(w.lab_id))
        await _mk(db, ScaleValue, owner, entity_type="observation", entity_id=obs.id, scale_id="importance", value=7.5)
        await db.commit()
    await _login(client, "owner")
    c1, c2 = await _snapshot(client, w.lab_id, "первый"), await _snapshot(client, w.lab_id, "второй")
    assert c1["parent_id"] is None and c2["parent_id"] == c1["id"]

    def canon(v):  # независимая от кода сервиса запись (в этих данных нет целых float'ов)
        return json.dumps(v, sort_keys=True, separators=(",", ":"), ensure_ascii=False)

    parent_hash = None
    async with AsyncSessionLocal() as db:
        for cp in (await db.execute(select(LabCheckpoint).order_by(LabCheckpoint.id))).scalars().all():
            rows = (await db.execute(select(LabCheckpointItem).where(LabCheckpointItem.checkpoint_id == cp.id))).scalars().all()
            lines = []
            for it in rows:
                expect = hashlib.sha256(canon({"kind": it.kind, "key": it.object_key, "data": it.snapshot_data, "blob": it.blob_sha256}).encode()).hexdigest()
                assert it.item_hash == expect
                lines.append(f"{it.object_key}\t{it.item_hash}")
            tree = hashlib.sha256("\n".join(sorted(lines)).encode()).hexdigest()
            assert cp.tree_hash == tree
            ts = cp.created_at.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")
            payload = canon({"v": 1, "lab_id": cp.lab_id, "parent": parent_hash, "tree": tree, "created_at": ts, "title": cp.title})
            assert cp.commit_hash == hashlib.sha256(payload.encode()).hexdigest()
            assert await svc.verify_checkpoint(db, cp.id) == []
            parent_hash = cp.commit_hash

    async with AsyncSessionLocal() as db:   # правка копии задним числом
        await db.execute(text("UPDATE lab_checkpoint_items SET snapshot_data = jsonb_set(snapshot_data, '{title}', '\"hacked\"') "
                              "WHERE checkpoint_id = :c AND kind = 'entity'"), {"c": c1["id"]})
        await db.commit()
        problems = await svc.verify_checkpoint(db, c1["id"])
        assert any(p.startswith("item:entity:observation:") for p in problems) and "tree" in problems
        assert await svc.verify_checkpoint(db, c2["id"]) == []            # соседний снимок не затронут

    async with AsyncSessionLocal() as db:   # удаление строки из копии
        await db.execute(text("DELETE FROM lab_checkpoint_items WHERE checkpoint_id = :c AND kind = 'lab'"), {"c": c2["id"]})
        await db.commit()
        problems = await svc.verify_checkpoint(db, c2["id"])
        assert "item_count" in problems and "tree" in problems


@pytest.mark.asyncio
async def test_verify_detects_missing_blob_when_asked(client, _dirs):
    (_dirs.atts / "u1.txt").write_bytes(b"data")
    w = await _world("owner")
    async with AsyncSessionLocal() as db:
        owner = w.uid["owner"]
        obs = await _mk(db, Observation, owner, title="o", text="o", **_lab_kw(w.lab_id))
        await _mk(db, EntityAttachment, owner, entity_type="observation", entity_id=obs.id, kind="code", filename="a.txt",
                  mime_type="text/plain", size_bytes=4, storage_path="u1.txt", language=None, text_content="data")
        await db.commit()
    await _login(client, "owner")
    cp = await _snapshot(client, w.lab_id)
    async with AsyncSessionLocal() as db:
        assert await svc.verify_checkpoint(db, cp["id"], check_blobs=True) == []
        for p in _dirs.blobs.rglob("*"):
            if p.is_file():
                p.unlink()
        assert await svc.verify_checkpoint(db, cp["id"], check_blobs=True) == [f"blob:{hashlib.sha256(b'data').hexdigest()}"]
        assert await svc.verify_checkpoint(db, cp["id"]) == []              # без флага файлы не проверяются


# ── схема и транзакция ───────────────────────────────────────────────────────

def _cp(lab_id, parent_id=None):
    return LabCheckpoint(lab_id=lab_id, parent_id=parent_id, schema_version=1, tree_hash="0" * 64,
                         commit_hash="0" * 64, item_count=0, blob_bytes=0, created_at=datetime.now(timezone.utc))


@pytest.mark.asyncio
async def test_chain_is_linear_per_lab_but_may_cross_labs():
    w = await _world("owner")
    async with AsyncSessionLocal() as db:
        other = await _lab(db, w.uid["owner"])
        await db.commit()
        other_id = other.id

    async with AsyncSessionLocal() as db:
        root = _cp(w.lab_id)
        db.add(root)
        await db.commit()
        root_id = root.id
    async with AsyncSessionLocal() as db:       # второй корень в той же лабе
        db.add(_cp(w.lab_id))
        with pytest.raises(IntegrityError):
            await db.commit()
    async with AsyncSessionLocal() as db:
        db.add(_cp(w.lab_id, root_id))
        await db.commit()
    async with AsyncSessionLocal() as db:       # второй потомок того же снимка
        db.add(_cp(w.lab_id, root_id))
        with pytest.raises(IntegrityError):
            await db.commit()
    async with AsyncSessionLocal() as db:       # будущий fork: первый снимок ДРУГОЙ лабы с родителем из этой
        db.add(_cp(other_id, root_id))
        await db.commit()


def test_chain_conflict_detection():
    mk = lambda **kw: DBAPIError("stmt", {}, SimpleNamespace(**kw))
    assert svc.is_chain_conflict(mk(sqlstate="23505")) and svc.is_chain_conflict(mk(sqlstate="40001"))
    assert svc.is_chain_conflict(mk(pgcode="23505"))
    assert not svc.is_chain_conflict(mk(sqlstate="23503")) and not svc.is_chain_conflict(mk())


@pytest.mark.asyncio
async def test_snapshot_transaction_runs_in_repeatable_read():
    async with svc.snapshot_session_maker()() as db:
        assert (await db.execute(text("SHOW transaction_isolation"))).scalar_one() == "repeatable read"


# ── сериализация ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_serialize_row_uses_columns_only():
    w = await _world("owner")
    async with AsyncSessionLocal() as db:
        obs = await _mk(db, Observation, w.uid["owner"], title="t", text="x")
        obs.junk = object()                       # приписанный атрибут, не колонка
        data = serialize_row(obs)
        from sqlalchemy import inspect as sa_inspect
        assert set(data) == {a.key for a in sa_inspect(Observation).mapper.column_attrs}
        assert "_sa_instance_state" not in data and "junk" not in data
        json.dumps(data)                           # JSON-совместимо: datetime уже строки
        assert isinstance(data["created_at"], str) and data["title"] == "t"


# ── дополнение: пути, не покрытые первым прогоном ────────────────────────────

@pytest.mark.asyncio
async def test_entity_hypothesis_and_result_source_links_follow_the_rules(client):
    from app.models.entities import EntityHypothesis, ResultSourceLink
    w = await _world("owner")
    async with AsyncSessionLocal() as db:
        owner = w.uid["owner"]
        task = await _mk(db, ResearchTask, owner, name="T", **_lab_kw(w.lab_id))
        hyp = await _mk(db, Hypothesis, owner, name="H", **_lab_kw(w.lab_id))
        outside = await _mk(db, Hypothesis, owner, name="вне лабы")
        await _mk(db, EntityHypothesis, owner, parent_type="task", parent_id=task.id, hypothesis_id=hyp.id)
        await _mk(db, EntityHypothesis, owner, parent_type="task", parent_id=task.id, hypothesis_id=outside.id)
        src = await _mk(db, SourceDocument, owner, entity_type="hypothesis", entity_id=hyp.id, url="https://example.test", title="s")
        res = await _mk(db, Result, owner, lab_id=w.lab_id, title="R", visibility="lab")
        await _mk(db, ResultSourceLink, owner, result_id=res.id, source_document_id=src.id)
        await db.commit()
        task_id, hyp_id, src_id = task.id, hyp.id, src.id
    await _login(client, "owner")
    view = await _view(client, w.lab_id, (await _snapshot(client, w.lab_id))["id"])
    assert [(e["parent_id"], e["hypothesis_id"]) for e in view["entity_hypotheses"]] == [(task_id, hyp_id)]   # гипотеза вне лабы не входит
    links = view["results"][0]["children"]["result_source_link"]
    assert [l["data"]["source_document_id"] for l in links] == [src_id]
    async with AsyncSessionLocal() as db:
        assert await svc.verify_checkpoint(db, (await client.get(_url(w.lab_id))).json()[0]["id"]) == []


@pytest.mark.asyncio
async def test_deleting_the_lab_removes_its_snapshots_entities_stay_blobs_wait_for_gc(client, _dirs):
    from sqlalchemy import func
    (_dirs.atts / "u1.txt").write_bytes(b"keep")
    w = await _world("owner")
    async with AsyncSessionLocal() as db:
        owner = w.uid["owner"]
        obs = await _mk(db, Observation, owner, title="o", text="o", **_lab_kw(w.lab_id))
        await _mk(db, EntityAttachment, owner, entity_type="observation", entity_id=obs.id, kind="code", filename="a.txt",
                  mime_type="text/plain", size_bytes=4, storage_path="u1.txt", language=None, text_content="keep")
        await db.commit()
        obs_id = obs.id
    await _login(client, "owner")
    await _snapshot(client, w.lab_id)
    assert len(_blob_files(_dirs)) == 1

    r = await client.delete(f"/api/v1/labs/{w.lab_id}")
    assert r.status_code < 300, r.text
    async with AsyncSessionLocal() as db:
        assert (await db.execute(select(func.count()).select_from(LabCheckpoint))).scalar_one() == 0
        assert (await db.execute(select(func.count()).select_from(LabCheckpointItem))).scalar_one() == 0
        kept = await db.get(Observation, obs_id)
        assert kept is not None and kept.lab_id is None                       # запись осталась у автора
    assert len(_blob_files(_dirs)) == 1                                       # файл без ссылок ждёт фоновой чистки


@pytest.mark.asyncio
async def test_parallel_creation_one_wins_the_other_gets_conflict(client, monkeypatch):
    import asyncio
    w = await _world("owner")
    await _login(client, "owner")
    barrier = asyncio.Barrier(2)
    original = svc.collect_items

    async def synced(db, lab_id):
        await barrier.wait()          # оба запроса уже прочитали «родителя» и держат свой снимок БД
        return await original(db, lab_id)

    monkeypatch.setattr(svc, "collect_items", synced)
    first, second = await asyncio.wait_for(
        asyncio.gather(client.post(_url(w.lab_id), json={}), client.post(_url(w.lab_id), json={})), 60)
    assert sorted([first.status_code, second.status_code]) == [201, 409], (first.text, second.text)
    loser = first if first.status_code == 409 else second
    assert loser.json()["detail"] == {"code": "checkpoint_conflict"}
    listed = (await client.get(_url(w.lab_id))).json()
    assert len(listed) == 1 and listed[0]["parent_id"] is None
    async with AsyncSessionLocal() as db:
        assert await svc.verify_checkpoint(db, listed[0]["id"]) == []
