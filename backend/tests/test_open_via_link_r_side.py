"""Согласие record_shares привязано к лаборатории и записи-источнику R, а не к её состоянию:
R в private закрывает N, возврат в ту же лабу открывает снова, перенос R в другую лабу не открывает ни там, ни там."""
import pytest

from tests.conftest import add_lab_member
from tests.test_open_via_link import _login, _mk_lab, _world, create_test_user
from tests.test_publication_share import _post_link
from tests.test_publication_share_paths import _status


def _vis(client, r, vis, lab):
    return client.put(f"/api/v1/observation/{r}/visibility", json={"visibility": vis, "lab_id": lab})


@pytest.mark.asyncio
async def test_consent_follows_lab_and_source_not_state(client):
    """ОХРАННЫЙ (зелёный до патча: код не меняется)."""
    a, b, c, lab, r, n = await _world(client)
    lab2 = await _mk_lab(client, "ov-lab2")
    d = await create_test_user("ov_d"); await add_lab_member(lab2, d.id)
    await _login(client, "ov_a")
    resp = await _post_link(client, n, r, share="lab")
    assert resp.status_code in (200, 201), resp.text
    url = f"/api/v1/observations/{n}"
    assert await _status(client, "ov_b", url) == 200          # согласие работает
    assert await _status(client, "ov_d", url) != 200          # участник другой лабы не видит
    await _login(client, "ov_a")
    resp = await _vis(client, r, "private", None); assert resp.status_code == 200, resp.text
    assert await _status(client, "ov_b", url) != 200          # R в private: N закрыта
    await _login(client, "ov_a")
    resp = await _vis(client, r, "lab", lab); assert resp.status_code == 200, resp.text
    assert await _status(client, "ov_b", url) == 200          # вернулась в ту же лабу: открыта по прежнему согласию
    await _login(client, "ov_a")
    resp = await _vis(client, r, "lab", lab2); assert resp.status_code == 200, resp.text
    assert await _status(client, "ov_b", url) != 200          # перенос в L2: не открыта в L
    assert await _status(client, "ov_d", url) != 200          # и не открыта в L2
