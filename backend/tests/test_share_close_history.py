"""События share_closed / share_opened приватные: видны только автору. Другая сторона связи (владелец R) их в истории не видит."""
import pytest

from tests.test_open_via_link import _login, _mk_obs, _world
from tests.test_publication_share import _post_link
from tests.test_publication_share_undo import _event_id


@pytest.mark.asyncio
async def test_link_history_of_the_other_side_hides_share_events(client):
    a, b, c, lab, r, n = await _world(client)
    await _login(client, "ov_b")
    nb = await _mk_obs(client, "NB")
    assert (await _post_link(client, nb, r, share="lab")).status_code == 200
    sid = (await client.get(f"/api/v1/observation/{nb}/shares")).json()[0]["id"]
    assert (await client.delete(f"/api/v1/observation/{nb}/shares/{sid}")).status_code == 200
    own = await client.get(f"/api/v1/observation/{nb}/link-history")
    assert own.status_code == 200, own.text
    assert "share_closed" in [i["type"] for i in own.json()]          # автору видно
    await _login(client, "ov_a")
    other = await client.get(f"/api/v1/observation/{r}/link-history")
    assert other.status_code == 200, other.text
    assert not {"share_closed", "share_opened"} & {i["type"] for i in other.json()}, other.json()


@pytest.mark.asyncio
async def test_close_returns_event_id_for_undo(client):
    a, b, c, lab, r, n = await _world(client)
    assert (await _post_link(client, n, r, share="lab")).status_code == 200
    sid = (await client.get(f"/api/v1/observation/{n}/shares")).json()[0]["id"]
    resp = await client.delete(f"/api/v1/observation/{n}/shares/{sid}")
    assert resp.status_code == 200, resp.text
    assert resp.json().get("event_id") == await _event_id("share_closed")
