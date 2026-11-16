"""Публичная лаборатория: связь приватной записи с публичной записью лаборатории даёт выбор «только мне / всем».
«Участникам» там не предлагается: чтение через связь работает только для записей с видимостью «лаборатория»."""
from types import SimpleNamespace

import pytest

from app.models.entities import Link, RecordShare
from tests.test_open_via_link import _login, _mk_obs, _world, create_test_user
from tests.test_publication_share import _count, _post_link


async def _mk_public_lab(client, name):
    r = await client.post("/api/v1/labs", json={"name": name, "is_public": True, "open_join": False,
                                                "goal_type": "task", "new_goal_title": "g"})
    assert r.status_code == 200, r.text
    return r.json()["id"]


async def _public_world(client):
    await create_test_user("pl_a"); await create_test_user("pl_s")
    await _login(client, "pl_a")
    lab = await _mk_public_lab(client, "pl-lab")
    r = await _mk_obs(client, "R", lab, "lab")      # в публичной лаборатории станет public
    n = await _mk_obs(client, "N")
    return lab, r, n


@pytest.mark.asyncio
async def test_public_lab_409_offers_me_and_public(client):
    lab, r, n = await _public_world(client)
    resp = await _post_link(client, n, r)
    assert resp.status_code == 409, resp.text
    imp = resp.json()["detail"]["impacts"][0]
    assert imp["options"] == ["me", "public"] and imp["lab_is_public"] is True, imp
    assert await _count(Link) == 0


@pytest.mark.asyncio
async def test_public_lab_share_public_publishes_record_with_the_link(client):
    lab, r, n = await _public_world(client)
    resp = await _post_link(client, n, r, share="public")
    assert resp.status_code == 200, resp.text
    assert await _count(Link) == 1 and await _count(RecordShare) == 0
    await _login(client, "pl_s")
    assert (await client.get(f"/api/v1/observations/{n}")).status_code == 200


@pytest.mark.asyncio
async def test_public_lab_share_me_keeps_record_private(client):
    """ОХРАННЫЙ (зелёный и до патча): сегодняшнее поведение публичных лабораторий равно «только мне»."""
    lab, r, n = await _public_world(client)
    resp = await _post_link(client, n, r, share="me")
    assert resp.status_code == 200, resp.text
    assert await _count(Link) == 1
    await _login(client, "pl_s")
    assert (await client.get(f"/api/v1/observations/{n}")).status_code != 200


@pytest.mark.asyncio
async def test_public_lab_rejects_share_lab(client):
    lab, r, n = await _public_world(client)
    resp = await _post_link(client, n, r, share="lab")
    assert resp.status_code == 400, resp.text
    assert await _count(Link) == 0


@pytest.mark.asyncio
async def test_share_me_hides_the_link_from_members(client):
    a, b, c, lab, r, n = await _world(client)
    assert (await _post_link(client, n, r, share="me")).status_code == 200
    await _login(client, "ov_b")
    rel = await client.get(f"/api/v1/graph/related/observation/{r}")
    assert rel.status_code == 200, rel.text
    assert n not in [i["id"] for i in rel.json()["related"].get("observation", [])]


def test_closed_prediction_cannot_be_published():
    from app.core.lab_access import _share_options
    from app.core.prediction_status import CLOSED_PREDICTION_STATUSES
    closed = SimpleNamespace(status=sorted(CLOSED_PREDICTION_STATUSES)[0])
    assert _share_options("prediction", closed, True) == ["me"]
    assert _share_options("prediction", SimpleNamespace(status="__not_closed__"), True) == ["me", "public"]
    assert _share_options("prediction", closed, False) == ["me", "lab"]
