"""Откат удаления связи снова открывает запись лаборатории, значит, тоже требует согласия (share=lab)."""
import pytest
from sqlalchemy import select

from app.db.session import AsyncSessionLocal
from app.models.entities import Event
from tests.test_open_via_link import _login, _world


@pytest.mark.asyncio
async def test_undo_of_unlink_needs_consent(client):
    a, b, c, lab, r, n = await _world(client)
    p = {"from_type": "observation", "from_id": n, "to_type": "observation", "to_id": r, "link_type": "связано"}
    assert (await client.post("/api/v1/graph/links", params={**p, "share": "lab"})).status_code == 200
    assert (await client.delete("/api/v1/graph/links", params={k: p[k] for k in ("from_type", "from_id", "to_type", "to_id")})).status_code == 200
    async with AsyncSessionLocal() as db:
        ev = (await db.execute(select(Event.id).where(Event.type == "unlinked"))).scalar_one()
    url = f"/api/v1/observation/{n}/undo/{ev}"
    resp = await client.post(url)
    assert resp.status_code == 409 and resp.json()["detail"]["code"] == "needs_consent", resp.text
    await _login(client, "ov_b")
    assert (await client.get(f"/api/v1/observations/{n}")).status_code != 200       # без согласия не открылась
    await _login(client, "ov_a")
    assert (await client.post(url, params={"share": "lab"})).status_code == 200
    await _login(client, "ov_b")
    assert (await client.get(f"/api/v1/observations/{n}")).status_code == 200
