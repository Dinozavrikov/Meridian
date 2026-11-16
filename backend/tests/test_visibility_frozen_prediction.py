"""PUT /{type}/{id}/visibility не должен менять лабораторию и видимость закрытого прогноза
(как PUT /predictions/{id}): вклад закрытого прогноза уже учтён в сигнале лаборатории."""
import pytest
from sqlalchemy import func, select, update

from app.core.prediction_status import CLOSED_PREDICTION_STATUSES
from app.db.session import AsyncSessionLocal
from app.models.entities import Prediction, RecordShare
from tests.test_open_via_link import _mk_lab, _world
from tests.test_open_via_link_sources import _mk_hyp


async def _lab_pred(client, lab, hyp, closed):
    r = await client.post("/api/v1/predictions/", json={
        "title": "P", "text": "t", "date_created": "2026-08-06", "expected_check_date": "2026-12-01T00:00:00",
        "visibility": "lab", "lab_id": lab, "hypothesis_id": hyp})
    assert r.status_code == 201, r.text
    p = r.json()["id"]
    if closed:
        async with AsyncSessionLocal() as db:
            await db.execute(update(Prediction).where(Prediction.id == p).values(status=sorted(CLOSED_PREDICTION_STATUSES)[0]))
            await db.commit()
    return p


async def _add_share(a, lab, p, via_obs):
    async with AsyncSessionLocal() as db:
        db.add(RecordShare(entity_type="prediction", entity_id=p, lab_id=lab, via_type="observation", via_id=via_obs, granted_by=a.id))
        await db.commit()


async def _state(p):
    async with AsyncSessionLocal() as db:
        pr = await db.get(Prediction, p)
        n = await db.scalar(select(func.count()).select_from(RecordShare).where(
            RecordShare.entity_type == "prediction", RecordShare.entity_id == p))
        return pr.visibility, pr.lab_id, n


def _put(client, p, vis, lab):
    return client.put(f"/api/v1/prediction/{p}/visibility", json={"visibility": vis, "lab_id": lab})


@pytest.mark.asyncio
@pytest.mark.parametrize("vis,other", [("private", False), ("public", False), ("lab", True)])
async def test_closed_prediction_visibility_frozen(client, vis, other):
    a, b, c, lab, r, n = await _world(client)
    h = await _mk_hyp(client, lab)
    p = await _lab_pred(client, lab, h, closed=True)
    await _add_share(a, lab, p, r)
    target = (await _mk_lab(client, "other-lab")) if other else None
    resp = await _put(client, p, vis, target)
    assert resp.status_code == 400, resp.text          # КРАСНЫЙ на старом коде: сейчас 200
    assert await _state(p) == ("lab", lab, 1)           # состояние и согласие не тронуты


@pytest.mark.asyncio
async def test_closed_prediction_same_state_ok(client):
    """ОХРАННЫЙ (зелёный до патча): повторный PUT того же состояния у закрытого прогноза проходит."""
    a, b, c, lab, r, n = await _world(client)
    h = await _mk_hyp(client, lab)
    p = await _lab_pred(client, lab, h, closed=True)
    await _add_share(a, lab, p, r)
    resp = await _put(client, p, "lab", lab)
    assert resp.status_code == 200, resp.text
    assert await _state(p) == ("lab", lab, 1)


@pytest.mark.asyncio
async def test_open_prediction_visibility_change_still_works(client):
    """ОХРАННЫЙ (зелёный до патча): у открытого прогноза смена видимости работает и сбрасывает согласия."""
    a, b, c, lab, r, n = await _world(client)
    h = await _mk_hyp(client, lab)
    p = await _lab_pred(client, lab, h, closed=False)
    await _add_share(a, lab, p, r)
    resp = await _put(client, p, "private", None)
    assert resp.status_code == 200, resp.text
    assert await _state(p) == ("private", None, 0)


@pytest.mark.asyncio
async def test_update_pred_closed_visibility_frozen(client):
    """ОХРАННЫЙ (зелёный до и после патча): PUT /predictions/{id} у закрытого прогноза отказывает при смене видимости."""
    a, b, c, lab, r, n = await _world(client)
    h = await _mk_hyp(client, lab)
    p = await _lab_pred(client, lab, h, closed=True)
    resp = await client.put(f"/api/v1/predictions/{p}", json={"title": "P", "text": "t", "date_created": "2026-08-06",
                                                            "expected_check_date": "2026-12-01T00:00:00", "visibility": "private"})
    assert resp.status_code == 400, resp.text
    assert await _state(p) == ("lab", lab, 0)
