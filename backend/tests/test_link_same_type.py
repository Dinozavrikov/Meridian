"""Связи записей одного типа: «подтверждает/опровергает» между ними запрещены; между разными типами всё как раньше."""
import pytest

from tests.test_open_via_link import _world


async def _post(client, url, body):
    resp = await client.post(url, json=body)
    assert resp.status_code in (200, 201), resp.text
    return resp.json()["id"]


async def _two_hyps(client):
    return [await _post(client, "/api/v1/hypotheses/", {"name": n, "description": "d", "date_created": "2026-08-06",
                                                        "status": "идея", "visibility": "private"})
            for n in ("SAMET h1", "SAMET h2")]


async def _task(client):
    return await _post(client, "/api/v1/tasks/", {"name": "SAMET task", "visibility": "private"})


def _ends(a, b):
    return {"from_type": a[0], "from_id": a[1], "to_type": b[0], "to_id": b[1]}


async def _link(client, a, b, link_type):
    return await client.post("/api/v1/graph/links", params={**_ends(a, b), "link_type": link_type})


async def _retype(client, a, b, link_type):
    return await client.put("/api/v1/graph/links", params={**_ends(a, b), "link_type": link_type})


async def _unlink(client, a, b):
    resp = await client.delete("/api/v1/graph/links", params=_ends(a, b))
    assert resp.status_code == 200, resp.text
    return resp.json()["removed"]


@pytest.mark.asyncio
@pytest.mark.parametrize("lt", ["подтверждает", "опровергает"])
async def test_same_type_link_rejects_evidence_types(client, lt):
    await _world(client)
    h1, h2 = await _two_hyps(client)
    a, b = ("hypothesis", h1), ("hypothesis", h2)
    r = await _link(client, a, b, lt)
    assert r.status_code == 400, r.text                          # КРАСНЫЙ на старом коде
    assert await _unlink(client, a, b) == 0                      # связь не создана


@pytest.mark.asyncio
async def test_same_type_neutral_link_is_created(client):
    """ОХРАННЫЙ (зелёный до патча)."""
    await _world(client)
    h1, h2 = await _two_hyps(client)
    a, b = ("hypothesis", h1), ("hypothesis", h2)
    r = await _link(client, a, b, "связано")
    assert r.status_code == 200, r.text
    assert await _unlink(client, a, b) == 1                      # связь реально была создана


@pytest.mark.asyncio
async def test_different_types_still_accept_evidence_types(client):
    """ОХРАННЫЙ (зелёный до патча): правило только для пар одного типа."""
    await _world(client)
    h1, _ = await _two_hyps(client)
    a, b = ("hypothesis", h1), ("task", await _task(client))
    r = await _link(client, a, b, "подтверждает")
    assert r.status_code == 200, r.text
    assert await _unlink(client, a, b) == 1


@pytest.mark.asyncio
async def test_set_type_same_type_rejects_evidence(client):
    await _world(client)
    h1, h2 = await _two_hyps(client)
    a, b = ("hypothesis", h1), ("hypothesis", h2)
    assert (await _link(client, a, b, "связано")).status_code == 200
    r = await _retype(client, a, b, "подтверждает")
    assert r.status_code == 400, r.text                          # КРАСНЫЙ на старом коде
    assert (await _retype(client, a, b, "related")).status_code == 200      # нейтральная смена разрешена


@pytest.mark.asyncio
async def test_set_type_different_types_accepts_evidence(client):
    """ОХРАННЫЙ (зелёный до патча)."""
    await _world(client)
    h1, _ = await _two_hyps(client)
    a, b = ("hypothesis", h1), ("task", await _task(client))
    assert (await _link(client, a, b, "связано")).status_code == 200
    assert (await _retype(client, a, b, "подтверждает")).status_code == 200
