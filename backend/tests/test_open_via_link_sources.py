"""Запись, открытая через связь: все три вида связи публикуют (Link: test_open_via_link*).
Здесь: прогноз<->гипотеза (Prediction.hypothesis_id, автор = владелец прогноза) и EntityHypothesis (автора нет:
открывает только когда у обеих сторон один владелец). R всегда лабораторная запись владельца лаборатории a."""
import pytest

from app.db.session import AsyncSessionLocal
from app.models.entities import EntityHypothesis
from tests.share_helpers import add_share
from tests.test_open_via_link import _login, _world


async def _mk_hyp(client, lab=None):
    body = {"name": "H", "description": "d", "date_created": "2026-08-06", "status": "идея", "visibility": "lab" if lab else "private"}
    if lab:
        body["lab_id"] = lab
    r = await client.post("/api/v1/hypotheses/", json=body)
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


async def _mk_pred(client, hyp, lab=None):
    body = {"title": "P", "text": "t", "date_created": "2026-08-06", "expected_check_date": "2026-12-01T00:00:00",
            "hypothesis_id": hyp, "visibility": "lab" if lab else "private"}
    if lab:
        body["lab_id"] = lab
    r = await client.post("/api/v1/predictions/", params={"share": "lab"}, json=body)
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


async def _mk_task(client):
    r = await client.post("/api/v1/tasks/", json={"name": "T", "visibility": "private"})
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


async def _view(client, username, base, oid):
    await _login(client, username)
    listed = {o["id"] for o in (await client.get(base)).json()}
    return {"listed": oid in listed, "direct": (await client.get(f"{base}{oid}")).status_code}


def _closed(v):
    return not v["listed"] and v["direct"] != 200


async def _eh(task_id, hyp_id):
    async with AsyncSessionLocal() as db:
        db.add(EntityHypothesis(parent_type="task", parent_id=task_id, hypothesis_id=hyp_id))
        await db.commit()
    await add_share("task", task_id, "hypothesis", hyp_id)


@pytest.mark.asyncio
async def test_private_prediction_of_a_lab_hypothesis_is_opened(client):
    a, b, c, lab, r, n = await _world(client)
    h = await _mk_hyp(client, lab)
    p = await _mk_pred(client, h)
    assert (await _view(client, "ov_a", "/api/v1/predictions/", p))["direct"] == 200      # контроль: путь верный
    assert (v := await _view(client, "ov_b", "/api/v1/predictions/", p)) == {"listed": True, "direct": 200}, v


@pytest.mark.asyncio
async def test_private_hypothesis_of_a_lab_prediction_is_opened(client):
    a, b, c, lab, r, n = await _world(client)
    h = await _mk_hyp(client)
    await _mk_pred(client, h, lab)
    assert (await _view(client, "ov_a", "/api/v1/hypotheses/", h))["direct"] == 200
    assert (v := await _view(client, "ov_b", "/api/v1/hypotheses/", h)) == {"listed": True, "direct": 200}, v


@pytest.mark.asyncio
async def test_task_of_one_owner_with_a_lab_hypothesis_is_opened(client):
    a, b, c, lab, r, n = await _world(client)
    h = await _mk_hyp(client, lab)
    t = await _mk_task(client)
    await _eh(t, h)
    assert (await _view(client, "ov_a", "/api/v1/tasks/", t))["direct"] == 200
    assert (v := await _view(client, "ov_b", "/api/v1/tasks/", t)) == {"listed": True, "direct": 200}, v


@pytest.mark.asyncio
async def test_entity_hypothesis_between_different_owners_opens_nothing(client):
    """Автора привязки нет, поэтому чужую приватную задачу гипотезой лаборатории не раскрыть."""
    a, b, c, lab, r, n = await _world(client)
    h = await _mk_hyp(client, lab)
    await _login(client, "ov_c")
    t = await _mk_task(client)
    await _eh(t, h)
    assert _closed(await _view(client, "ov_b", "/api/v1/tasks/", t))


@pytest.mark.asyncio
async def test_stranger_sees_none_of_them(client):
    """ОХРАННЫЙ (зелёный и до патча)."""
    a, b, c, lab, r, n = await _world(client)
    h = await _mk_hyp(client, lab)
    p = await _mk_pred(client, h)
    t = await _mk_task(client)
    await _eh(t, h)
    assert _closed(await _view(client, "ov_s", "/api/v1/predictions/", p))
    assert _closed(await _view(client, "ov_s", "/api/v1/tasks/", t))
