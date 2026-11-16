"""Счётчики «N + M» в /labs/{id}: запись из корзины в открытые не входит. Реально помечаем запись удалённой и смотрим на счётчик."""
import pytest
from sqlalchemy import func, update

from app.db.session import AsyncSessionLocal
from app.models.entities import Observation
from tests.test_open_via_link import _login, _world
from tests.test_publication_share import _post_link


@pytest.mark.asyncio
async def test_trashed_opened_observation_is_not_counted(client):
    """ОХРАННЫЙ (зелёный и до патча: not_deleted уже внутри opened_via_link_condition)."""
    a, b, c, lab, r, n = await _world(client)
    assert (await _post_link(client, n, r, share="lab")).status_code == 200
    await _login(client, "ov_b")
    resp = await client.get(f"/api/v1/labs/{lab}")
    assert resp.status_code == 200, resp.text
    assert resp.json()["observations_opened_count"] == 1, resp.json()
    async with AsyncSessionLocal() as db:
        await db.execute(update(Observation).where(Observation.id == n).values(deleted_at=func.now()))
        await db.commit()
    resp = await client.get(f"/api/v1/labs/{lab}")
    assert resp.status_code == 200, resp.text
    assert resp.json()["observations_opened_count"] == 0, resp.json()
