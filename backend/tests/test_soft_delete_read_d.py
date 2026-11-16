"""Soft-delete, фаза 3c-2: личный граф, поиск, комментарии/непрочитанное, публичная лента
(события, total, счётчики), репосты, легаси-посты."""
import inspect
import pytest

from app.api.v1.search import search as _search_fn
from app.db.session import AsyncSessionLocal
from app.models.entities import EntityHypothesis, Event, Link
from app.models.social import EntityComment
from tests.conftest import create_test_user
from tests.test_soft_delete_api import TYPES, _build, _delete_url, _login

_SEARCH_FIELD = {"observation": "text", "hypothesis": "description", "prediction": "text",
                 "worldview": "belief", "question": "text", "task": "description"}


async def _mk(etype, uid, suffix="", **attrs):
    async with AsyncSessionLocal() as db:
        o = _build(etype, uid, f"d3-{etype}{suffix}", False, 0)
        for k, v in attrs.items():
            setattr(o, k, v)
        db.add(o)
        await db.commit()
        await db.refresh(o)
        return o.id


@pytest.mark.asyncio
@pytest.mark.parametrize("etype", TYPES)
async def test_personal_graph_node_disappears_and_returns(client, etype):
    u = await create_test_user(f"d3_g_{etype}")
    eid = await _mk(etype, u.id)
    await _login(client, u.username)

    async def has():
        r = await client.get("/api/v1/graph/")
        assert r.status_code == 200, r.text
        return any(n["type"] == etype and n["eid"] == eid for n in r.json()["nodes"])

    assert await has()
    assert (await client.delete(_delete_url(etype, eid))).status_code == 204
    assert not await has()
    assert (await client.post(f"/api/v1/{etype}/{eid}/restore")).status_code == 204
    assert await has()


@pytest.mark.asyncio
async def test_personal_graph_edges_follow_trash(client):
    u = await create_test_user("d3_edges")
    hid = await _mk("hypothesis", u.id)
    oid = await _mk("observation", u.id)
    pid = await _mk("prediction", u.id, hypothesis_id=hid)
    tid = await _mk("task", u.id)
    async with AsyncSessionLocal() as db:
        db.add_all([
            Link(user_id=u.id, from_type="observation", from_id=oid, to_type="hypothesis", to_id=hid, link_type="подтверждает"),
            EntityHypothesis(parent_type="task", parent_id=tid, hypothesis_id=hid),
        ])
        await db.commit()
    await _login(client, u.username)

    async def edges():
        r = await client.get("/api/v1/graph/")
        assert r.status_code == 200, r.text
        return {frozenset((e["from"], e["to"])) for e in r.json()["edges"]}

    e_link = frozenset((f"o_{oid}", f"h_{hid}"))
    e_pred = frozenset((f"p_{pid}", f"h_{hid}"))
    e_task = frozenset((f"t_{tid}", f"h_{hid}"))
    assert {e_link, e_pred, e_task} <= await edges()

    assert (await client.delete(_delete_url("observation", oid))).status_code == 204
    got = await edges()
    assert e_link not in got and {e_pred, e_task} <= got

    assert (await client.delete(_delete_url("hypothesis", hid))).status_code == 204
    assert not ({e_pred, e_task} & await edges())  # ни одного ребра к мёртвой гипотезе

    assert (await client.post(f"/api/v1/hypothesis/{hid}/restore")).status_code == 204
    assert (await client.post(f"/api/v1/observation/{oid}/restore")).status_code == 204
    assert {e_link, e_pred, e_task} <= await edges()


@pytest.mark.asyncio
@pytest.mark.parametrize("etype", TYPES)
async def test_search_excludes_trashed(client, etype):
    u = await create_test_user(f"d3_s_{etype}")
    token = f"zqx{etype}marker"
    eid = await _mk(etype, u.id, **{_SEARCH_FIELD[etype]: token})
    await _login(client, u.username)
    qname = next(iter(inspect.signature(_search_fn).parameters))

    async def found():
        r = await client.get("/api/v1/search/", params={qname: token})
        assert r.status_code == 200, r.text
        data = r.json()
        items = data if isinstance(data, list) else data.get("results", [])
        return any(i["type"] == etype and i["id"] == eid for i in items)

    assert await found()
    assert (await client.delete(_delete_url(etype, eid))).status_code == 204
    assert not await found()
    assert (await client.post(f"/api/v1/{etype}/{eid}/restore")).status_code == 204
    assert await found()


@pytest.mark.asyncio
@pytest.mark.parametrize("etype", TYPES)
async def test_unread_summary_and_thread_hide_trashed_parent(client, etype):
    owner = await create_test_user(f"d3_c_o_{etype}")
    other = await create_test_user(f"d3_c_x_{etype}")
    eid = await _mk(etype, owner.id)
    async with AsyncSessionLocal() as db:
        db.add(EntityComment(entity_type=etype, entity_id=eid, author_id=other.id, content="привет"))
        await db.commit()
    await _login(client, owner.username)

    async def unread():
        r = await client.get("/api/v1/comments/unread/summary")
        assert r.status_code == 200, r.text
        data = r.json()
        items = data if isinstance(data, list) else data.get("items", [])
        return any(i["entity_type"] == etype and i["entity_id"] == eid for i in items)

    assert await unread()
    assert (await client.delete(_delete_url(etype, eid))).status_code == 204
    assert not await unread()
    r = await client.get(f"/api/v1/comments/{etype}/{eid}")
    assert r.status_code == 404 or r.json() == []
    assert (await client.post(f"/api/v1/{etype}/{eid}/restore")).status_code == 204
    assert await unread()
    assert len((await client.get(f"/api/v1/comments/{etype}/{eid}")).json()) == 1


async def _events(*evs):
    async with AsyncSessionLocal() as db:
        db.add_all(evs)
        await db.commit()


async def _feed(client):
    r = await client.get("/api/v1/feed/groups/public", params={"page_size": 50})
    assert r.status_code == 200, r.text
    return r.json()


def _cores(d):
    return {g["core"]["entity_id"] for g in d["groups"]}


@pytest.mark.asyncio
async def test_groups_feed_drops_trashed_record_and_counts_stay_consistent(client):
    u = await create_test_user("d3_feed1")
    keep = await _mk("observation", u.id, "-keep", visibility="public")
    gone = await _mk("observation", u.id, "-gone", visibility="public")
    await _login(client, u.username)

    d = await _feed(client)
    assert _cores(d) == {keep, gone}
    assert d["total"] == 2 and d["type_counts"].get("observation") == 2

    assert (await client.delete(_delete_url("observation", gone))).status_code == 204
    d = await _feed(client)
    assert _cores(d) == {keep}
    assert d["total"] == 1 and d["type_counts"].get("observation") == 1

    assert (await client.post(f"/api/v1/observation/{gone}/restore")).status_code == 204
    d = await _feed(client)
    assert _cores(d) == {keep, gone}
    assert d["total"] == 2 and d["type_counts"].get("observation") == 2


@pytest.mark.asyncio
async def test_groups_feed_does_not_show_link_to_trashed_record(client):
    u = await create_test_user("d3_feed2")
    oid = await _mk("observation", u.id, "", visibility="public")
    hid = await _mk("hypothesis", u.id, "", visibility="public")
    from tests.conftest import AsyncSessionLocal
    from app.models.entities import Link
    async with AsyncSessionLocal() as s_:
        s_.add(Link(user_id=u.id, from_type="observation", from_id=oid,
                    to_type="hypothesis", to_id=hid, link_type="подтверждает"))
        await s_.commit()
    await _login(client, u.username)

    d = await _feed(client)
    assert d["total"] == 1 and d["groups"][0]["size"] == 2, "гипотеза и подтверждающее наблюдение — одна карточка"
    assert (await client.delete(_delete_url("hypothesis", hid))).status_code == 204
    d = await _feed(client)
    assert d["total"] == 1 and d["groups"][0]["size"] == 1 and d["groups"][0]["members"] == []
    assert d["groups"][0]["core"]["entity_id"] == oid
    assert (await client.post(f"/api/v1/hypothesis/{hid}/restore")).status_code == 204
    d = await _feed(client)
    assert d["total"] == 1 and d["groups"][0]["size"] == 2


@pytest.mark.asyncio
async def test_legacy_posts_and_repost_respect_trash(client):
    u = await create_test_user("d3_posts")
    hid = await _mk("hypothesis", u.id)
    oid = await _mk("observation", u.id)
    await _login(client, u.username)
    assert (await client.get(f"/api/v1/feed/hypothesis/{hid}/posts")).status_code == 200
    assert (await client.get(f"/api/v1/feed/observation/{oid}/posts")).status_code == 200
    body = {"source_type": "observation", "source_id": oid, "target_type": "observation", "target": "personal"}
    r = await client.post("/api/v1/feed/repost", json=body)
    assert r.status_code == 200, r.text

    assert (await client.delete(_delete_url("hypothesis", hid))).status_code == 204
    assert (await client.delete(_delete_url("observation", oid))).status_code == 204
    assert (await client.get(f"/api/v1/feed/hypothesis/{hid}/posts")).status_code == 404
    assert (await client.get(f"/api/v1/feed/observation/{oid}/posts")).status_code == 404
    assert (await client.post("/api/v1/feed/repost", json=body)).status_code == 404


@pytest.mark.asyncio
async def test_trash_items_expose_visibility_lab_and_status(client):
    u = await create_test_user("d3_trashfields")
    eid = await _mk("prediction", u.id, visibility="public", status="подтвердился")
    await _login(client, u.username)
    assert (await client.delete(_delete_url("prediction", eid))).status_code == 204
    item = (await client.get("/api/v1/trash")).json()[0]
    assert (item["visibility"], item["status"], item["lab_id"]) == ("public", "подтвердился", None)


@pytest.mark.asyncio
async def test_due_reminders_skip_trashed_prediction(monkeypatch):
    from datetime import datetime, timedelta, timezone
    from app.services.prediction_reminders import send_due_prediction_reminders
    sent = []

    async def fake_send(**kw):
        sent.append(kw["to"])

    monkeypatch.setattr("app.services.prediction_reminders.send_email", fake_send)
    past = datetime.now(timezone.utc) - timedelta(days=1)
    live_u = await create_test_user("d3_rem_live")
    dead_u = await create_test_user("d3_rem_dead")
    await _mk("prediction", live_u.id, "-rem-live", expected_check_date=past)
    await _mk("prediction", dead_u.id, "-rem-dead", expected_check_date=past, deleted_at=datetime.now(timezone.utc))
    await send_due_prediction_reminders()
    assert sent == [live_u.email]
