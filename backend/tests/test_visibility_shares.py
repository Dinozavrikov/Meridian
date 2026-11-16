"""Смена видимости записи сбрасывает согласия record_shares, выданные для неё как для открытой через связь.
Иначе возврат в private воскрешает старое согласие без нового вопроса: новое решение должно быть явным."""
import pytest

from app.models.entities import RecordShare
from tests.test_open_via_link import _login, _mk_lab, _world
from tests.test_publication_share import _count, _post_link
from tests.test_publication_share_paths import _status


async def _put_vis(client, n, **body):
    return await client.put(f"/api/v1/observation/{n}/visibility", json=body)


async def _shared_world(client):
    a, b, c, lab, r, n = await _world(client)
    assert (await _post_link(client, n, r, share="lab")).status_code == 200
    assert await _count(RecordShare) == 1
    assert await _status(client, "ov_b", f"/api/v1/observations/{n}") == 200
    await _login(client, "ov_a")
    return lab, r, n


@pytest.mark.asyncio
async def test_private_to_lab_to_private_does_not_resurrect_share(client):
    lab, r, n = await _shared_world(client)
    assert (await _put_vis(client, n, visibility="lab", lab_id=lab)).status_code == 200
    assert (await _put_vis(client, n, visibility="private")).status_code == 200
    assert await _count(RecordShare) == 0
    assert await _status(client, "ov_b", f"/api/v1/observations/{n}") != 200


@pytest.mark.asyncio
async def test_public_then_private_does_not_resurrect_share(client):
    lab, r, n = await _shared_world(client)
    assert (await _put_vis(client, n, visibility="public")).status_code == 200
    assert (await _put_vis(client, n, visibility="private")).status_code == 200
    assert await _count(RecordShare) == 0
    assert await _status(client, "ov_b", f"/api/v1/observations/{n}") != 200


@pytest.mark.asyncio
async def test_same_visibility_put_keeps_share(client):
    """ОХРАННЫЙ (зелёный и до патча): PUT без реальной смены не снимает согласие."""
    lab, r, n = await _shared_world(client)
    assert (await _put_vis(client, n, visibility="private")).status_code == 200
    assert await _count(RecordShare) == 1
    assert await _status(client, "ov_b", f"/api/v1/observations/{n}") == 200


@pytest.mark.asyncio
async def test_cannot_move_record_into_foreign_lab(client):
    """ОХРАННЫЙ (зелёный и до патча): чужая лаборатория недоступна."""
    a, b, c, lab, r, n = await _world(client)
    await _login(client, "ov_s")
    foreign = await _mk_lab(client, "foreign-lab")
    await _login(client, "ov_a")
    resp = await _put_vis(client, n, visibility="lab", lab_id=foreign)
    assert resp.status_code == 403, resp.text
