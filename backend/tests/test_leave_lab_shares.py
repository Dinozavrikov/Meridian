"""Выход участника из лаборатории снимает его согласия record_shares для этой лаборатории:
возврат не должен молча открывать его приватные записи (предпосылка согласия — членство)."""
import pytest
from sqlalchemy import func, select

from app.db.session import AsyncSessionLocal
from app.models.entities import RecordShare
from tests.conftest import add_lab_member
from tests.test_open_via_link import _login, _mk_obs, _world
from tests.test_publication_share import _post_link
from tests.test_publication_share_paths import _status


async def _shares(n):
    async with AsyncSessionLocal() as db:
        return await db.scalar(select(func.count()).select_from(RecordShare).where(
            RecordShare.entity_type == "observation", RecordShare.entity_id == n))


@pytest.mark.asyncio
async def test_leave_lab_drops_own_shares(client):
    a, b, c, lab, r, n = await _world(client)
    await _login(client, "ov_b")
    rb = await _mk_obs(client, "Rb", lab, "lab")
    nb = await _mk_obs(client, "Nb")
    resp = await _post_link(client, nb, rb, share="lab")
    assert resp.status_code in (200, 201), resp.text
    url = f"/api/v1/observations/{nb}"
    assert await _status(client, "ov_c", url) == 200            # фикстура рабочая: согласие действует
    assert await _shares(nb) == 1
    await _login(client, "ov_b")
    resp = await client.delete(f"/api/v1/labs/{lab}/leave")
    assert resp.status_code == 200, resp.text
    assert await _shares(nb) == 0                               # КРАСНЫЙ на старом коде: согласие осталось
    await add_lab_member(lab, b.id)                             # вернулся
    assert await _status(client, "ov_c", url) != 200            # без нового согласия запись закрыта
