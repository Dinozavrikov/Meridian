"""Согласие на открытие записи лаборатории: сервер отвечает 409 needs_consent, пока владелец не подтвердит (share=lab).
Если связь ничего не открывает, согласие не требуется (409 не должно быть шумом)."""
import pytest
from sqlalchemy import func, select

from app.db.session import AsyncSessionLocal
from app.models.entities import EntityHypothesis, Link
from tests.test_open_via_link import _login, _mk_obs, _world
from tests.test_open_via_link_sources import _mk_hyp, _mk_task


async def _post_link(client, n, r, **extra):
    return await client.post("/api/v1/graph/links", params={
        "from_type": "observation", "from_id": n, "to_type": "observation", "to_id": r, "link_type": "связано", **extra})


async def _count(model):
    async with AsyncSessionLocal() as db:
        return (await db.execute(select(func.count()).select_from(model))).scalar_one()


@pytest.mark.asyncio
async def test_link_that_opens_a_record_needs_consent(client):
    a, b, c, lab, r, n = await _world(client)
    resp = await _post_link(client, n, r)
    assert resp.status_code == 409, resp.text
    d = resp.json()["detail"]
    assert d["code"] == "needs_consent" and d["impacts"][0]["lab_id"] == lab and d["impacts"][0]["members"] == 3, d
    assert await _count(Link) == 0                       # без согласия связи нет
    await _login(client, "ov_b")
    assert (await client.get(f"/api/v1/observations/{n}")).status_code != 200
    await _login(client, "ov_a")
    assert (await _post_link(client, n, r, share="lab")).status_code == 200
    assert await _count(Link) == 1
    await _login(client, "ov_b")
    assert (await client.get(f"/api/v1/observations/{n}")).status_code == 200


@pytest.mark.asyncio
async def test_link_that_opens_nothing_needs_no_consent(client):
    """ОХРАННЫЙ (зелёный и до патча): без открытия 409 быть не должно."""
    a, b, c, lab, r, n = await _world(client)
    plain = await _mk_obs(client, "Plain")                       # приватная и без лаборатории
    assert (await _post_link(client, n, plain)).status_code == 200
    same_lab = await _mk_obs(client, "InLab", lab, "lab")        # N уже видна этой лаборатории
    assert (await _post_link(client, same_lab, r)).status_code == 200


@pytest.mark.asyncio
async def test_prediction_create_needs_consent_when_it_opens(client):
    a, b, c, lab, r, n = await _world(client)
    h = await _mk_hyp(client, lab)
    body = {"title": "P", "text": "t", "date_created": "2026-08-06", "expected_check_date": "2026-12-01T00:00:00",
            "hypothesis_id": h, "visibility": "private"}
    resp = await client.post("/api/v1/predictions/", json=body)
    assert resp.status_code == 409 and resp.json()["detail"]["code"] == "needs_consent", resp.text
    assert (await client.post("/api/v1/predictions/", params={"share": "lab"}, json=body)).status_code in (200, 201)
    shared = await client.post("/api/v1/predictions/", json={**body, "visibility": "lab", "lab_id": lab})
    assert shared.status_code in (200, 201), shared.text         # уже лабораторный: согласие не нужно


@pytest.mark.asyncio
async def test_prediction_update_needs_consent_when_new_hypothesis_opens_it(client):
    a, b, c, lab, r, n = await _world(client)
    h = await _mk_hyp(client, lab)
    body = {"title": "P", "text": "t", "date_created": "2026-08-06", "expected_check_date": "2026-12-01T00:00:00",
            "visibility": "private"}
    pid = (await client.post("/api/v1/predictions/", json=body)).json()["id"]
    resp = await client.put(f"/api/v1/predictions/{pid}", json={**body, "hypothesis_id": h})
    assert resp.status_code == 409, resp.text
    assert (await client.put(f"/api/v1/predictions/{pid}", params={"share": "lab"}, json={**body, "hypothesis_id": h})).status_code == 200


@pytest.mark.asyncio
async def test_task_hypothesis_binding_needs_consent_from_the_owner(client):
    a, b, c, lab, r, n = await _world(client)
    h = await _mk_hyp(client, lab)
    t = await _mk_task(client)
    resp = await client.post(f"/api/v1/tasks/{t}/hypotheses/{h}")
    assert resp.status_code == 409 and resp.json()["detail"]["code"] == "needs_consent", resp.text
    assert await _bound("task", t) == 0          # привязок ЭТОЙ задачи нет (автопривязка гипотезы к цели лаборатории не в счёт)
    assert (await client.post(f"/api/v1/tasks/{t}/hypotheses/{h}", params={"share": "lab"})).status_code == 204
    assert await _bound("task", t) == 1


async def _bound(parent_type, parent_id):
    async with AsyncSessionLocal() as db:
        return (await db.execute(select(func.count()).select_from(EntityHypothesis).where(
            EntityHypothesis.parent_type == parent_type, EntityHypothesis.parent_id == parent_id))).scalar_one()


@pytest.mark.asyncio
async def test_question_hypothesis_binding_needs_consent_from_the_owner(client):
    a, b, c, lab, r, n = await _world(client)
    h = await _mk_hyp(client, lab)
    q = (await client.post("/api/v1/questions/", json={"title": "Q", "date_created": "2026-08-06", "visibility": "private"})).json()["id"]
    resp = await client.post(f"/api/v1/questions/{q}/hypotheses/{h}")
    assert resp.status_code == 409 and resp.json()["detail"]["code"] == "needs_consent", resp.text
    assert await _bound("question", q) == 0
    assert (await client.post(f"/api/v1/questions/{q}/hypotheses/{h}", params={"share": "lab"})).status_code == 204
    assert await _bound("question", q) == 1
