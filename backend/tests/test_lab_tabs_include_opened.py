"""Вкладки лаборатории: include_opened=true добавляет записи, открытые именно этой лабе через связь.
Счётчики в шапке лабы строгие — открытые не включают."""
import pytest

from tests.test_open_via_link import _link, _login, _world


async def _obs_ids(client, lab, **params):
    r = await client.get("/api/v1/observations/", params={"lab_id": lab, **params})
    assert r.status_code == 200, r.text
    return {o["id"] for o in r.json()}


@pytest.mark.asyncio
async def test_include_opened_toggles_opened_observation(client):
    a, b, c, lab, r, n = await _world(client)
    await _link(a.id, n, r)
    await _login(client, "ov_b")
    strict = await _obs_ids(client, lab)
    assert r in strict and n not in strict
    with_opened = await _obs_ids(client, lab, include_opened="true")
    assert r in with_opened and n in with_opened


@pytest.mark.asyncio
async def test_counter_does_not_include_opened(client):
    """Счётчик в шапке == строгий список, открытые не включает."""
    a, b, c, lab, r, n = await _world(client)
    await _link(a.id, n, r)
    await _login(client, "ov_b")
    strict = await _obs_ids(client, lab)
    with_opened = await _obs_ids(client, lab, include_opened="true")
    assert len(with_opened) == len(strict) + 1
    counter = (await client.get(f"/api/v1/labs/{lab}")).json()["observations_count"]
    assert counter == len(strict)


async def _link_generic(by_user_id, from_type, n, to_type, r):
    from app.db.session import AsyncSessionLocal
    from app.models.entities import Link
    from tests.share_helpers import add_share
    async with AsyncSessionLocal() as db:
        db.add(Link(user_id=by_user_id, from_type=from_type, from_id=n, to_type=to_type, to_id=r, link_type="связано"))
        await db.commit()
    await add_share(from_type, n, to_type, r, by_user_id)


@pytest.mark.asyncio
async def test_include_opened_toggles_opened_hypothesis(client):
    from tests.test_open_via_link_sources import _mk_hyp
    a, b, c, lab, r, n = await _world(client)
    h = await _mk_hyp(client, lab=None)  # ещё под ov_a из _world
    await _link_generic(a.id, "hypothesis", h, "observation", r)
    await _login(client, "ov_b")
    strict = {x["id"] for x in (await client.get("/api/v1/hypotheses/", params={"lab_id": lab})).json()}
    assert h not in strict
    full = {x["id"] for x in (await client.get("/api/v1/hypotheses/", params={"lab_id": lab, "include_opened": "true"})).json()}
    assert h in full


@pytest.mark.asyncio
async def test_include_opened_toggles_opened_prediction(client):
    from tests.test_open_via_link_sources import _mk_hyp, _mk_pred
    a, b, c, lab, r, n = await _world(client)
    hyp = await _mk_hyp(client, lab=None)
    pred = await _mk_pred(client, hyp, lab=None)
    await _link_generic(a.id, "prediction", pred, "observation", r)
    await _login(client, "ov_b")
    strict = {x["id"] for x in (await client.get("/api/v1/predictions/", params={"lab_id": lab})).json()}
    assert pred not in strict
    full = {x["id"] for x in (await client.get("/api/v1/predictions/", params={"lab_id": lab, "include_opened": "true"})).json()}
    assert pred in full


@pytest.mark.asyncio
async def test_counter_strict_and_opened(client):
    a, b, c, lab, r, n = await _world(client)
    await _link(a.id, n, r)
    await _login(client, "ov_b")
    out = (await client.get(f"/api/v1/labs/{lab}")).json()
    assert out["observations_count"] == 1
    assert out["observations_opened_count"] == 1
