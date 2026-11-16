"""Панель «Кому открыто»: владелец видит, каким лабораториям запись открыта через связь, и может закрыть доступ.
Закрытие снимает только согласие: связь остаётся, участники запись больше не видят."""
import pytest

from app.models.entities import Link, RecordShare
from tests.test_open_via_link import _login, _world
from tests.test_publication_share import _count, _post_link
from tests.test_publication_share_paths import _status


async def _shared(client):
    a, b, c, lab, r, n = await _world(client)
    assert (await _post_link(client, n, r, share="lab")).status_code == 200
    return lab, r, n


@pytest.mark.asyncio
async def test_owner_sees_shares_with_lab_and_via_title(client):
    lab, r, n = await _shared(client)
    resp = await client.get(f"/api/v1/observation/{n}/shares")
    assert resp.status_code == 200, resp.text
    rows = resp.json()
    assert len(rows) == 1, rows
    assert rows[0]["lab_id"] == lab and rows[0]["lab_name"] == "ov-lab"
    assert rows[0]["via_type"] == "observation" and rows[0]["via_id"] == r and rows[0]["via_title"] == "R"


@pytest.mark.asyncio
async def test_record_without_shares_gives_empty_list(client):
    """ОХРАННЫЙ-ПОДОБНЫЙ: приватная запись без согласий даёт пустой список, а не 404."""
    lab, r, n = await _shared(client)
    resp = await client.get(f"/api/v1/observation/{r}/shares")
    assert resp.status_code == 200 and resp.json() == [], resp.text


@pytest.mark.asyncio
async def test_non_owner_cannot_list_or_close(client):
    lab, r, n = await _shared(client)
    sid = (await client.get(f"/api/v1/observation/{n}/shares")).json()[0]["id"]
    await _login(client, "ov_b")
    assert (await client.get(f"/api/v1/observation/{n}/shares")).status_code == 403
    assert (await client.delete(f"/api/v1/observation/{n}/shares/{sid}")).status_code == 403
    assert await _count(RecordShare) == 1


@pytest.mark.asyncio
async def test_close_removes_access_but_keeps_link(client):
    lab, r, n = await _shared(client)
    sid = (await client.get(f"/api/v1/observation/{n}/shares")).json()[0]["id"]
    resp = await client.delete(f"/api/v1/observation/{n}/shares/{sid}")
    assert resp.status_code == 200, resp.text
    assert await _count(RecordShare) == 0 and await _count(Link) == 1
    assert await _status(client, "ov_b", f"/api/v1/observations/{n}") != 200


@pytest.mark.asyncio
async def test_close_of_foreign_or_missing_share_is_404(client):
    """Строка согласия другой записи по id чужой записи не удаляется."""
    lab, r, n = await _shared(client)
    sid = (await client.get(f"/api/v1/observation/{n}/shares")).json()[0]["id"]
    assert (await client.delete(f"/api/v1/observation/{r}/shares/{sid}")).status_code == 404
    assert (await client.delete(f"/api/v1/observation/{n}/shares/999999")).status_code == 404
    assert await _count(RecordShare) == 1
