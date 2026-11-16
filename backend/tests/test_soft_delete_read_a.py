"""Soft-delete, фаза 3a: чтение/правка через 6 роутеров сущностей.
Запись в корзине для ВСЕХ (владелец, другой пользователь, гость) — не в списках,
404 в detail (по id и по slug), 404 на PUT; после restore всё возвращается.
Плюс: рефлексии (require_owned_entity), конкурирующие гипотезы и граф задачи."""
import pytest

from app.core.entity_registry import ENTITY_MODELS
from app.db.session import AsyncSessionLocal
from app.models.entities import EntityHypothesis
from tests.conftest import create_test_user
from tests.test_soft_delete_api import TYPES, _build, _delete_url, _login, _make


def _item(etype, eid):
    return _delete_url(etype, eid)


def _list(etype):
    return _delete_url(etype, 0).rsplit("/", 1)[0] + "/"


async def _ids(client, etype):
    r = await client.get(_list(etype))
    assert r.status_code == 200, r.text
    return [i["id"] for i in r.json()]


async def _set_public(etype, eid):
    async with AsyncSessionLocal() as db:
        o = await db.get(ENTITY_MODELS[etype], eid)
        o.visibility = "public"
        await db.commit()


@pytest.mark.asyncio
@pytest.mark.parametrize("etype", TYPES)
async def test_trashed_entity_is_gone_for_everyone_until_restored(client, etype):
    owner = await create_test_user(f"r3_own_{etype}")
    other = await create_test_user(f"r3_oth_{etype}")
    eid = await _make(etype, owner.id)
    await _set_public(etype, eid)
    slug_url = _delete_url(etype, f"p2-{etype}")

    await _login(client, other.username)
    assert eid in await _ids(client, etype)
    assert (await client.get(_item(etype, eid))).status_code == 200
    assert (await client.get(slug_url)).status_code == 200

    await _login(client, owner.username)
    body = (await client.get(_item(etype, eid))).json()
    assert (await client.delete(_item(etype, eid))).status_code == 204

    for who in (owner, other):
        await _login(client, who.username)
        assert eid not in await _ids(client, etype), who.username
        assert (await client.get(_item(etype, eid))).status_code == 404, who.username
        assert (await client.get(slug_url)).status_code == 404, who.username
    client.cookies.clear()  # гость
    assert eid not in await _ids(client, etype)
    assert (await client.get(_item(etype, eid))).status_code == 404

    await _login(client, owner.username)
    r = await client.put(_item(etype, eid), json=body)
    assert r.status_code == 404, (r.status_code, r.text)

    assert (await client.post(f"/api/v1/{etype}/{eid}/restore")).status_code == 204
    assert eid in await _ids(client, etype)
    assert (await client.get(_item(etype, eid))).status_code == 200
    await _login(client, other.username)
    assert eid in await _ids(client, etype)
    assert (await client.get(slug_url)).status_code == 200


@pytest.mark.asyncio
@pytest.mark.parametrize("etype", ["observation", "prediction", "worldview"])
async def test_reflections_of_trashed_entity_are_404(client, etype):
    u = await create_test_user(f"r3_rf_{etype}")
    eid = await _make(etype, u.id)
    await _login(client, u.username)
    url = f"{_item(etype, eid)}/reflections"
    assert (await client.get(url)).status_code == 200
    assert (await client.delete(_item(etype, eid))).status_code == 204
    assert (await client.get(url)).status_code == 404
    assert (await client.post(f"/api/v1/{etype}/{eid}/restore")).status_code == 204
    assert (await client.get(url)).status_code == 200


@pytest.mark.asyncio
async def test_hypothesis_owner_only_endpoints_404_when_trashed(client):
    u = await create_test_user("r3_hyp_owner")
    eid = await _make("hypothesis", u.id)
    await _login(client, u.username)
    url = f"{_item('hypothesis', eid)}/maturity-suggestion"
    assert (await client.get(url)).status_code == 200
    assert (await client.delete(_item("hypothesis", eid))).status_code == 204
    assert (await client.get(url)).status_code == 404


@pytest.mark.asyncio
async def test_question_check_answers_404_when_trashed(client):
    u = await create_test_user("r3_q_owner")
    eid = await _make("question", u.id)
    await _login(client, u.username)
    assert (await client.delete(_item("question", eid))).status_code == 204
    r = await client.post(f"{_item('question', eid)}/check-answers")
    assert r.status_code == 404, (r.status_code, r.text)


@pytest.mark.asyncio
async def test_task_competing_hypotheses_hide_trashed_hypothesis(client):
    u = await create_test_user("r3_task_hyp")
    tid = await _make("task", u.id)
    hid = await _make("hypothesis", u.id)
    async with AsyncSessionLocal() as db:
        db.add(EntityHypothesis(parent_type="task", parent_id=tid, hypothesis_id=hid))
        await db.commit()
    await _login(client, u.username)
    url = f"{_item('task', tid)}/hypotheses"

    async def ids():
        r = await client.get(url)
        assert r.status_code == 200, r.text
        return [h["id"] for h in r.json()]

    assert await ids() == [hid]
    assert (await client.delete(_item("hypothesis", hid))).status_code == 204
    assert await ids() == []
    assert (await client.post(f"/api/v1/hypothesis/{hid}/restore")).status_code == 204
    assert await ids() == [hid]


@pytest.mark.asyncio
async def test_task_graph_hides_trashed_hypothesis_and_prediction(client):
    u = await create_test_user("r3_task_graph")
    tid = await _make("task", u.id)
    hid = await _make("hypothesis", u.id)
    async with AsyncSessionLocal() as db:
        db.add(EntityHypothesis(parent_type="task", parent_id=tid, hypothesis_id=hid))
        p = _build("prediction", u.id, "r3-graph-pred", False, 0)
        p.hypothesis_id = hid
        db.add(p)
        await db.commit()
        await db.refresh(p)
        pid = p.id
    await _login(client, u.username)
    url = f"{_item('task', tid)}/graph"

    async def has(kind, eid):
        r = await client.get(url)
        assert r.status_code == 200, r.text
        return any(n["type"] == kind and n["entity_id"] == eid for n in r.json()["nodes"])

    assert await has("hypothesis", hid) and await has("prediction", pid)
    assert (await client.delete(_item("prediction", pid))).status_code == 204
    assert await has("hypothesis", hid) and not await has("prediction", pid)
    assert (await client.post(f"/api/v1/prediction/{pid}/restore")).status_code == 204
    assert await has("prediction", pid)
    assert (await client.delete(_item("hypothesis", hid))).status_code == 204
    assert not await has("hypothesis", hid)
