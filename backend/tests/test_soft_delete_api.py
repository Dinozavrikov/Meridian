"""Soft-delete, фаза 2: DELETE-роуты -> корзина, restore, GET /trash,
DELETE .../permanent (+ полный каскад PR A через этот путь), слаги.
Чтение (списки/detail/поиск/граф/лента) — фаза 3, здесь не проверяется."""
import re
import pytest
from datetime import datetime, timedelta, timezone
from sqlalchemy import select

from app.main import app
from tests.route_utils import iter_api_routes
from app.db.session import AsyncSessionLocal
from app.core.entity_registry import ENTITY_MODELS
from app.core.lab_access import parent_alive_subquery
from app.core.slug import make_slug, unique_slug_for
from app.models.entities import (
    Observation, Hypothesis, Prediction, Worldview, Question, ResearchTask, Event, Tag,
    EntityTag, EntityImage, EntityAttachment, SourceDocument, EntityEmbedding, EntityStage,
    EntityReflection, EntityReflectionInsight, ScaleValue, Link,
)
from app.models.i18n import ContentTranslation
from app.models.social import EntityComment, UserCommentSeen
from tests.conftest import create_test_user

TYPES = ["observation", "hypothesis", "prediction", "worldview", "question", "task"]
_DELETE_FN = {
    "observation": "delete_obs", "hypothesis": "delete_hyp", "prediction": "delete_pred",
    "worldview": "delete_wv", "question": "delete_question", "task": "delete_task",
}
CHILD_MODELS = [
    EntityTag, EntityComment, UserCommentSeen, EntityImage, EntityAttachment, SourceDocument,
    EntityEmbedding, EntityStage, EntityReflection, EntityReflectionInsight, ScaleValue, ContentTranslation,
]


def _delete_url(etype, eid):
    """URL DELETE-роута берем через iter_api_routes по имени функции — префиксы не хардкодим."""
    fn = _DELETE_FN[etype]
    for r in iter_api_routes():
        ep = getattr(r, "endpoint", None)
        if ep is not None and ep.__name__ == fn and "DELETE" in r.methods:
            return re.sub(r"\{[^}]+\}", str(eid), r.path)
    raise AssertionError(f"нет DELETE-роута {fn}")


def _build(etype, user_id, slug, dead, age_days):
    dead_at = datetime.now(timezone.utc) - timedelta(days=age_days) if dead else None
    c = dict(user_id=user_id, slug=slug, deleted_at=dead_at)
    if etype == "observation":
        return Observation(**c, date="2026-09-24", author="t", title=f"T-{slug}", text="текст")
    if etype == "hypothesis":
        return Hypothesis(**c, name=f"T-{slug}", date_created="2026-09-24")
    if etype == "prediction":
        return Prediction(**c, title=f"T-{slug}", text="x", date_created="2026-09-24",
                          expected_check_date=datetime.now(timezone.utc) + timedelta(days=1))
    if etype == "worldview":
        return Worldview(**c, date="2026-09-24", belief=f"T-{slug}")
    if etype == "question":
        return Question(**c, title=f"T-{slug}", date_created="2026-09-24")
    return ResearchTask(**c, name=f"T-{slug}")


async def _make(etype, user_id, *, dead=False, age_days=0, suffix="", slug=None):
    async with AsyncSessionLocal() as db:
        o = _build(etype, user_id, slug or f"p2-{etype}{suffix}", dead, age_days)
        db.add(o)
        await db.commit()
        await db.refresh(o)
        return o.id


async def _get(etype, eid):
    async with AsyncSessionLocal() as db:
        return await db.get(ENTITY_MODELS[etype], eid)


async def _login(client, username, password="pass12345"):
    r = await client.post("/api/v1/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200, r.text


async def _count(db, model, **where):
    q = select(model)
    for k, v in where.items():
        q = q.where(getattr(model, k) == v)
    return len((await db.execute(q)).scalars().all())


async def _child_counts(etype, eid):
    async with AsyncSessionLocal() as db:
        out = {}
        for m in CHILD_MODELS:
            out[m.__name__] = await _count(db, m, entity_type=etype, entity_id=eid)
        out["Link"] = (await _count(db, Link, from_type=etype, from_id=eid)
                       + await _count(db, Link, to_type=etype, to_id=eid))
        return out


async def _events(etype, eid, ev_type):
    async with AsyncSessionLocal() as db:
        return (await db.execute(
            select(Event).where(Event.entity_type == etype, Event.entity_id == eid, Event.type == ev_type)
        )).scalars().all()


async def _add_children(etype, eid, user_id):
    now = datetime.now(timezone.utc)
    async with AsyncSessionLocal() as db:
        tag = Tag(user_id=user_id, name=f"tag-{etype}-{eid}")
        db.add(tag)
        await db.commit()
        await db.refresh(tag)
        db.add_all([
            EntityTag(entity_type=etype, entity_id=eid, tag_id=tag.id),
            EntityComment(entity_type=etype, entity_id=eid, author_id=user_id, content="комментарий"),
            UserCommentSeen(user_id=user_id, entity_type=etype, entity_id=eid),
            EntityImage(user_id=user_id, entity_type=etype, entity_id=eid, filename=f"{etype}{eid}.png",
                        thumb_filename=f"{etype}{eid}_t.png", width=10, height=10, size_bytes=100),
            EntityAttachment(user_id=user_id, entity_type=etype, entity_id=eid, kind="code", filename="a.py",
                             storage_path=f"{etype}{eid}.py", mime_type="text/x-python", size_bytes=10),
            SourceDocument(user_id=user_id, entity_type=etype, entity_id=eid, url="https://example.com/src"),
            EntityEmbedding(user_id=user_id, entity_type=etype, entity_id=eid, text_snapshot="t",
                            embedding=[0.1] * 1024, embedding_model="model-test"),
            EntityStage(user_id=user_id, entity_type=etype, entity_id=eid, current_stage="question"),
            EntityReflection(entity_type=etype, entity_id=eid, stage="creation", factors=[],
                             raw_dialogue_text="личный текст", created_at=now),
            EntityReflectionInsight(entity_type=etype, entity_id=eid, matched=[], added=[], dropped=[],
                                    insight="i", triggered_by="manual"),
            ScaleValue(user_id=user_id, entity_type=etype, entity_id=eid, scale_id="maturity", value=1.0),
            ContentTranslation(entity_type=etype, entity_id=eid, field="title", source_hash="h",
                               target_lang="en", translated_text="t"),
            Link(user_id=user_id, from_type=etype, from_id=eid, to_type="hypothesis", to_id=999001),
            Link(user_id=user_id, from_type="hypothesis", from_id=999002, to_type=etype, to_id=eid),
        ])
        await db.commit()


async def _visible_comments(etype, eid):
    async with AsyncSessionLocal() as db:
        return len((await db.execute(
            select(EntityComment.id).where(
                EntityComment.entity_type == etype, EntityComment.entity_id == eid,
                parent_alive_subquery(EntityComment.entity_type, EntityComment.entity_id),
            )
        )).scalars().all())


# ── DELETE = soft ────────────────────────────────────────────────────────

@pytest.mark.asyncio
@pytest.mark.parametrize("etype", TYPES)
async def test_delete_route_is_soft(client, etype):
    u = await create_test_user(f"sd_{etype}")
    await _login(client, u.username)
    eid = await _make(etype, u.id)
    await _add_children(etype, eid, u.id)
    before = await _child_counts(etype, eid)
    assert all(v >= 1 for v in before.values()), before

    r = await client.delete(_delete_url(etype, eid))
    assert r.status_code == 204, r.text

    obj = await _get(etype, eid)
    assert obj is not None and obj.deleted_at is not None  # физически жива
    first = obj.deleted_at
    evs = await _events(etype, eid, "soft_deleted")
    assert len(evs) == 1 and evs[0].actor_id == u.id
    assert await _child_counts(etype, eid) == before  # дети не тронуты (каскад PR A не сработал)

    r2 = await client.delete(_delete_url(etype, eid))  # повторный DELETE мёртвой записи
    assert r2.status_code == 404
    assert (await _get(etype, eid)).deleted_at == first  # deleted_at не перезаписан
    assert len(await _events(etype, eid, "soft_deleted")) == 1


# ── чужие записи ─────────────────────────────────────────────────────────

@pytest.mark.asyncio
@pytest.mark.parametrize("etype", TYPES)
async def test_other_user_cannot_delete_restore_or_purge(client, etype):
    owner = await create_test_user(f"own_{etype}")
    other = await create_test_user(f"oth_{etype}")
    dead_id = await _make(etype, owner.id, dead=True)
    live_id = await _make(etype, owner.id, suffix="-live")
    await _login(client, other.username)

    assert (await client.post(f"/api/v1/{etype}/{dead_id}/restore")).status_code == 404
    assert (await client.delete(f"/api/v1/{etype}/{dead_id}/permanent")).status_code == 404
    assert (await client.delete(_delete_url(etype, live_id))).status_code == 404

    dead = await _get(etype, dead_id)
    assert dead is not None and dead.deleted_at is not None
    live = await _get(etype, live_id)
    assert live is not None and live.deleted_at is None


# ── restore ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
@pytest.mark.parametrize("etype", TYPES)
async def test_restore_works_at_any_age_and_children_return(client, etype):
    u = await create_test_user(f"rs_{etype}")
    await _login(client, u.username)
    eid = await _make(etype, u.id, dead=True, age_days=1000)
    await _add_children(etype, eid, u.id)
    assert await _visible_comments(etype, eid) == 0  # у мёртвого родителя дети скрыты

    r = await client.post(f"/api/v1/{etype}/{eid}/restore")
    assert r.status_code == 204, r.text
    assert (await _get(etype, eid)).deleted_at is None
    assert len(await _events(etype, eid, "restored")) == 1
    assert await _visible_comments(etype, eid) == 1  # снова видны

    assert (await client.post(f"/api/v1/{etype}/{eid}/restore")).status_code == 400  # уже живая


# ── GET /trash ───────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_trash_is_personal_flat_and_filterable(client):
    a = await create_test_user("trash_a")
    b = await create_test_user("trash_b")
    a_dead = {}
    for i, et in enumerate(TYPES):
        a_dead[et] = await _make(et, a.id, dead=True, age_days=i)
        await _make(et, a.id, suffix="-live")
        await _make(et, b.id, dead=True, suffix="-b")

    await _login(client, a.username)
    r = await client.get("/api/v1/trash")
    assert r.status_code == 200, r.text
    data = r.json()
    assert {(i["entity_type"], i["id"]) for i in data} == {(et, eid) for et, eid in a_dead.items()}
    assert len(data) == 6
    for i in data:
        assert i["title"] == f"T-p2-{i['entity_type']}"
    dates = [datetime.fromisoformat(i["deleted_at"]) for i in data]
    assert dates == sorted(dates, reverse=True)

    r = await client.get("/api/v1/trash", params={"entity_type": "hypothesis"})
    assert [(i["entity_type"], i["id"]) for i in r.json()] == [("hypothesis", a_dead["hypothesis"])]
    assert (await client.get("/api/v1/trash", params={"entity_type": "nonsense"})).status_code == 400

    await _login(client, b.username)
    data_b = (await client.get("/api/v1/trash")).json()
    assert len(data_b) == 6 and all(i["title"].endswith("-b") for i in data_b)

    client.cookies.clear()
    assert (await client.get("/api/v1/trash")).status_code == 401


# ── permanent ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
@pytest.mark.parametrize("etype", TYPES)
async def test_permanent_on_live_entity_refused(client, etype):
    u = await create_test_user(f"pl_{etype}")
    await _login(client, u.username)
    eid = await _make(etype, u.id)
    await _add_children(etype, eid, u.id)
    before = await _child_counts(etype, eid)

    r = await client.delete(f"/api/v1/{etype}/{eid}/permanent")
    assert r.status_code == 400, r.text
    obj = await _get(etype, eid)
    assert obj is not None and obj.deleted_at is None
    assert await _child_counts(etype, eid) == before


@pytest.mark.asyncio
@pytest.mark.parametrize("etype", TYPES)
async def test_permanent_on_trashed_runs_full_pr_a_cascade(client, etype):
    """Регрессия PR A через НОВЫЙ путь: старого прямого DELETE для 6 типов больше нет."""
    u = await create_test_user(f"pc_{etype}")
    await _login(client, u.username)
    eid = await _make(etype, u.id, dead=True)
    ctl = await _make(etype, u.id, dead=True, suffix="-ctl")  # контроль: чужая запись не пострадает
    await _add_children(etype, eid, u.id)
    await _add_children(etype, ctl, u.id)
    ctl_before = await _child_counts(etype, ctl)

    r = await client.delete(f"/api/v1/{etype}/{eid}/permanent")
    assert r.status_code == 204, r.text

    assert await _get(etype, eid) is None
    after = await _child_counts(etype, eid)
    assert all(v == 0 for v in after.values()), after
    assert await _child_counts(etype, ctl) == ctl_before
    assert len(await _events(etype, eid, "deleted")) == 1
    assert (await client.post(f"/api/v1/{etype}/{eid}/restore")).status_code == 404  # восстанавливать нечего


# ── слаги ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
@pytest.mark.parametrize("etype", TYPES)
async def test_dead_entity_keeps_slug_reserved(etype):
    """Глобальный UniqueConstraint(slug) остаётся (п.6 ТЗ): генератор слагов обязан
    видеть мёртвых, иначе новая запись с тем же названием получит 500 на констрейнте."""
    u = await create_test_user(f"sg_{etype}")
    slug0 = make_slug("Тест")
    await _make(etype, u.id, dead=True, slug=slug0)
    async with AsyncSessionLocal() as db:
        new = await unique_slug_for(db, ENTITY_MODELS[etype], "Тест")
    assert new and new != slug0


@pytest.mark.asyncio
async def test_api_create_after_delete_same_title_is_not_500(client):
    u = await create_test_user("sd_slug_api")
    await _login(client, u.username)
    payload = {"title": "Дубль", "date": "2026-09-24", "author": "t", "text": "x",
               "lab_id": None, "visibility": "private"}
    r1 = await client.post("/api/v1/observations/", json=payload)
    assert r1.status_code == 201, r1.text
    assert (await client.delete(_delete_url("observation", r1.json()["id"]))).status_code == 204
    r2 = await client.post("/api/v1/observations/", json=payload)
    assert r2.status_code == 201, r2.text
    assert r2.json()["id"] != r1.json()["id"]
