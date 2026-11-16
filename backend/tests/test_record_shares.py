"""Согласие хранится (record_shares): без строки согласия связь ничего не открывает, что бы потом ни менялось."""
import pytest
from sqlalchemy import update

from app.db.session import AsyncSessionLocal
from app.models.entities import Link, Observation
from app.services.record_shares import backfill_record_shares
from tests.conftest import add_lab_member, create_test_user
from tests.test_open_via_link import _closed, _link, _login, _mk_obs, _view, _world


async def _raw_link(by, n, r):
    async with AsyncSessionLocal() as db:
        db.add(Link(user_id=by, from_type="observation", from_id=n, to_type="observation", to_id=r, link_type="связано"))
        await db.commit()


@pytest.mark.asyncio
async def test_neighbour_visibility_change_must_not_open_a_foreign_private_record(client):
    a, b, c, lab, r, n = await _world(client)
    await _login(client, "ov_c")
    r2 = await _mk_obs(client, "R2", lab, "lab")
    async with AsyncSessionLocal() as db:
        await db.execute(update(Observation).where(Observation.id == r2).values(visibility="private", lab_id=None)); await db.commit()
    await _link(a.id, n, r2)
    assert _closed(await _view(client, "ov_b", n))
    await _login(client, "ov_c")
    resp = await client.put(f"/api/v1/observations/{r2}", json={"title": "R2", "date": "2026-09-23", "author": "a", "text": "x",
                                                                "lab_id": lab, "visibility": "lab", "tags": []})
    assert resp.status_code == 200, resp.text
    assert _closed(await _view(client, "ov_b", n)), "c открыл чужую приватную запись a, не спросив его"


@pytest.mark.asyncio
async def test_author_joining_the_lab_later_opens_nothing(client):
    a, b, c, lab, r, n = await _world(client)
    x = await create_test_user("ov_x")
    await _login(client, "ov_x")
    n2 = await _mk_obs(client, "N2")
    await _raw_link(x.id, n2, r)
    await add_lab_member(lab, x.id)
    assert _closed(await _view(client, "ov_b", n2))


@pytest.mark.asyncio
async def test_backfill_recreates_consent_once(client):
    a, b, c, lab, r, n = await _world(client)
    await _raw_link(a.id, n, r)                      # старая связь без согласия
    assert _closed(await _view(client, "ov_b", n))
    async with AsyncSessionLocal() as db:
        first = await backfill_record_shares(db); await db.commit()
    async with AsyncSessionLocal() as db:
        second = await backfill_record_shares(db); await db.commit()
    assert (first, second) == (1, 0)
    assert (await _view(client, "ov_b", n))["direct"] == 200


async def _shares():
    from sqlalchemy import func, select
    from app.models.entities import RecordShare
    async with AsyncSessionLocal() as db:
        return (await db.execute(select(func.count()).select_from(RecordShare))).scalar_one()


@pytest.mark.asyncio
async def test_unlink_revokes_the_consent_row(client):
    a, b, c, lab, r, n = await _world(client)
    p = {"from_type": "observation", "from_id": n, "to_type": "observation", "to_id": r}
    assert (await client.post("/api/v1/graph/links", params={**p, "link_type": "связано", "share": "lab"})).status_code == 200
    assert await _shares() == 1
    assert (await client.delete("/api/v1/graph/links", params=p)).status_code == 200
    assert await _shares() == 0, "строка согласия пережила удаление связи"


@pytest.mark.asyncio
async def test_hard_delete_of_a_record_removes_its_consent_rows(client):
    from app.models.entities import Observation as Obs
    a, b, c, lab, r, n = await _world(client)
    p = {"from_type": "observation", "from_id": n, "to_type": "observation", "to_id": r, "link_type": "связано", "share": "lab"}
    assert (await client.post("/api/v1/graph/links", params=p)).status_code == 200
    assert await _shares() == 1
    async with AsyncSessionLocal() as db:
        await db.delete(await db.get(Obs, n)); await db.commit()
    assert await _shares() == 0, "осталась сирота в record_shares"
