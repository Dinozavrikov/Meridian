"""Посторонний (не участник) привязывает приватную запись к записи публичной лаборатории: ему предлагают
«Только мне / Всем» (public: запись публична, lab_id пуст, в сигнал не входит)."""
import pytest

from tests.test_open_via_link import _login, _mk_obs
from tests.test_publication_share import _post_link
from tests.test_publication_share_public import _public_world


async def _stranger(client):
    lab, r, n = await _public_world(client)        # pl_a владелец лаборатории, pl_s посторонний
    await _login(client, "pl_s")
    return r, await _mk_obs(client, "N-stranger")


@pytest.mark.asyncio
async def test_nonmember_is_asked(client):
    r, n = await _stranger(client)
    resp = await _post_link(client, n, r)
    assert resp.status_code == 409, resp.text              # КРАСНЫЙ на старом коде: сейчас 200/201
    d = resp.json()["detail"]
    assert d["code"] == "needs_consent" and d["impacts"][0]["options"] == ["me", "public"], d


@pytest.mark.asyncio
async def test_nonmember_share_public_publishes_without_lab(client):
    r, n = await _stranger(client)
    resp = await _post_link(client, n, r, share="public")
    assert resp.status_code in (200, 201), resp.text
    await _login(client, "pl_a")
    g = await client.get(f"/api/v1/observations/{n}")
    assert g.status_code == 200, g.text                    # КРАСНЫЙ на старом коде: запись осталась приватной
    assert g.json().get("lab_id") is None


@pytest.mark.asyncio
async def test_nonmember_share_me_keeps_private(client):
    """ОХРАННЫЙ (зелёный до патча): «Только мне» оставляет запись приватной."""
    r, n = await _stranger(client)
    resp = await _post_link(client, n, r, share="me")
    assert resp.status_code in (200, 201), resp.text
    await _login(client, "pl_a")
    assert (await client.get(f"/api/v1/observations/{n}")).status_code != 200
