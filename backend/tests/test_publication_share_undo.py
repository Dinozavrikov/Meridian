"""Путь вопроса и откаты competing_unlinked / field_unlinked: возврат связи снова спрашивает «кому видно»."""
import pytest
from sqlalchemy import select

from app.db.session import AsyncSessionLocal
from app.models.entities import Event, RecordShare
from tests.test_open_via_link import _login, _world
from tests.test_open_via_link_sources import _mk_hyp
from tests.test_publication_share import _count
from tests.test_publication_share_paths import _pred_body, _status


async def _event_id(etype):
    async with AsyncSessionLocal() as db:
        return (await db.execute(select(Event.id).where(Event.type == etype).order_by(Event.id.desc()))).scalars().first()


@pytest.mark.asyncio
@pytest.mark.parametrize("share,code", [(None, 409), ("me", 204), ("lab", 204), ("public", 400)])
async def test_question_binding_in_closed_lab(client, share, code):
    a, b, c, lab, r, n = await _world(client)
    h = await _mk_hyp(client, lab)
    q = (await client.post("/api/v1/questions/", json={"title": "Q", "date_created": "2026-08-06", "visibility": "private"})).json()["id"]
    resp = await client.post(f"/api/v1/questions/{q}/hypotheses/{h}", params={"share": share} if share else {})
    assert resp.status_code == code, resp.text
    assert await _count(RecordShare) == (1 if share == "lab" else 0)
    if code == 204:
        assert (await _status(client, "ov_b", f"/api/v1/questions/{q}") == 200) == (share == "lab")


@pytest.mark.asyncio
async def test_undo_competing_unlinked_asks_again(client):
    a, b, c, lab, r, n = await _world(client)
    h = await _mk_hyp(client, lab)
    q = (await client.post("/api/v1/questions/", json={"title": "Q", "date_created": "2026-08-06", "visibility": "private"})).json()["id"]
    assert (await client.post(f"/api/v1/questions/{q}/hypotheses/{h}", params={"share": "lab"})).status_code == 204
    assert (await client.delete(f"/api/v1/questions/{q}/hypotheses/{h}")).status_code == 204
    ev = await _event_id("competing_unlinked")
    assert ev is not None
    url = f"/api/v1/hypothesis/{h}/undo/{ev}"
    resp = await client.post(url)
    assert resp.status_code == 409 and resp.json()["detail"]["code"] == "needs_consent", resp.text
    assert (await client.post(url, params={"share": "lab"})).status_code == 200
    assert await _count(RecordShare) == 1


@pytest.mark.asyncio
async def test_undo_field_unlinked_asks_again(client):
    a, b, c, lab, r, n = await _world(client)
    h = await _mk_hyp(client, lab)
    pid = (await client.post("/api/v1/predictions/", params={"share": "lab"}, json=_pred_body(h))).json()["id"]
    assert (await client.delete(f"/api/v1/field-link/prediction/{pid}")).status_code == 200
    ev = await _event_id("field_unlinked")
    assert ev is not None
    url = f"/api/v1/prediction/{pid}/undo/{ev}"
    resp = await client.post(url)
    assert resp.status_code == 409 and resp.json()["detail"]["code"] == "needs_consent", resp.text
    assert (await client.post(url, params={"share": "lab"})).status_code == 200
