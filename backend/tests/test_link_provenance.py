"""related отдаёт, кто и когда связал; у старых связей даты нет."""
from sqlalchemy import update

from app.db.session import AsyncSessionLocal
from app.models.entities import Link
from tests.conftest import create_test_user
from tests.test_field_link import _item, _login, _setup


async def _obs(client):
    r = await client.post("/api/v1/observations/", json={"title": "o", "date": "2026-09-23", "author": "a", "text": "b", "lab_id": None, "visibility": "private"})
    return r.json()["id"]


async def test_new_link_has_author_and_date_old_link_has_none(client):
    await create_test_user("lp_a")
    await _login(client, "lp_a")
    _, h = await _setup(client)
    o = await _obs(client)
    await client.post(f"/api/v1/graph/links?from_type=observation&from_id={o}&to_type=hypothesis&to_id={h}&link_type=связано")
    it = await _item(client, "hypothesis", h, "observation")
    assert it["linked_by"]["username"] == "lp_a" and it["linked_at"] is not None
    async with AsyncSessionLocal() as db:
        await db.execute(update(Link).values(created_at=None))
        await db.commit()
    it = await _item(client, "hypothesis", h, "observation")
    assert it["linked_by"]["username"] == "lp_a" and it["linked_at"] is None


async def test_field_link_author_is_prediction_owner_without_date(client):
    await create_test_user("lp_b")
    await _login(client, "lp_b")
    p, h = await _setup(client)
    for etype, eid, itype in (("prediction", p, "hypothesis"), ("hypothesis", h, "prediction")):
        it = await _item(client, etype, eid, itype)
        assert it["linked_by"]["username"] == "lp_b" and it["linked_at"] is None
