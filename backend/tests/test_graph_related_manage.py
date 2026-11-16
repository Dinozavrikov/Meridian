"""Управление связями: удаление и смена типа в любом направлении, честные признаки direct/source/can_edit."""
from tests.conftest import create_test_user


async def _login(client, username, password="pass12345"):
    r = await client.post("/api/v1/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200


async def _mk(client):
    o = (await client.post("/api/v1/observations/", json={"title": "o", "date": "2026-09-23", "author": "a", "text": "b", "lab_id": None, "visibility": "private"})).json()["id"]
    h = (await client.post("/api/v1/hypotheses/", json={"name": "h", "description": "d", "date_created": "2026-08-06", "status": "идея", "visibility": "private"})).json()["id"]
    q = (await client.post("/api/v1/questions/", json={"title": "q", "date_created": "2026-08-06", "status": "открыт", "visibility": "private"})).json()["id"]
    return o, h, q


async def _related(client, etype, eid):
    r = await client.get(f"/api/v1/graph/related/{etype}/{eid}")
    assert r.status_code == 200, r.text
    return r.json()["related"]


async def test_reverse_direction_link_can_be_removed_and_retyped(client):
    await create_test_user("gm_owner")
    await _login(client, "gm_owner")
    o, h, _ = await _mk(client)
    # связь создана со стороны гипотезы, управляем со стороны наблюдения
    r = await client.post(f"/api/v1/graph/links?from_type=hypothesis&from_id={h}&to_type=observation&to_id={o}&link_type=связано")
    assert r.status_code == 200
    item = (await _related(client, "observation", o))["hypothesis"][0]
    assert item["direct"] is True and item["source"] == "link" and item["can_edit"] is True

    r = await client.put(f"/api/v1/graph/links?from_type=observation&from_id={o}&to_type=hypothesis&to_id={h}&link_type=подтверждает")
    assert r.status_code == 200, r.text
    assert (await _related(client, "observation", o))["hypothesis"][0]["link_type"] == "подтверждает"

    r = await client.delete(f"/api/v1/graph/links?from_type=observation&from_id={o}&to_type=hypothesis&to_id={h}")
    assert r.json()["removed"] == 1
    assert await _related(client, "observation", o) == {}


async def test_remove_nonexistent_link_reports_zero(client):
    await create_test_user("gm_owner2")
    await _login(client, "gm_owner2")
    o, h, _ = await _mk(client)
    r = await client.delete(f"/api/v1/graph/links?from_type=observation&from_id={o}&to_type=hypothesis&to_id={h}")
    assert r.status_code == 200 and r.json()["removed"] == 0


async def test_field_link_and_indirect_are_not_editable(client):
    await create_test_user("gm_owner3")
    await _login(client, "gm_owner3")
    o, h, q = await _mk(client)
    p = await client.post("/api/v1/predictions/", json={"title": "p", "text": "will", "date_created": "2026-08-06", "expected_check_date": "2026-09-06T00:00:00", "hypothesis_id": h, "status": "не проверен", "visibility": "private"})
    assert p.status_code in (200, 201), p.text
    await client.post(f"/api/v1/graph/links?from_type=observation&from_id={o}&to_type=hypothesis&to_id={h}&link_type=связано")
    await client.post(f"/api/v1/graph/links?from_type=hypothesis&from_id={h}&to_type=question&to_id={q}&link_type=связано")

    rel = await _related(client, "hypothesis", h)
    pred = rel["prediction"][0]
    assert pred["source"] == "field" and pred["can_edit"] is False and pred["direct"] is True

    rel_o = await _related(client, "observation", o)
    ques = rel_o["question"][0]
    assert ques["direct"] is False and ques["can_edit"] is False
    assert ques["parent_type"] == "hypothesis" and ques["parent_id"] == h


async def test_other_authors_link_is_not_editable(client):
    await create_test_user("gm_a")
    await create_test_user("gm_b")
    await _login(client, "gm_a")
    o, h, _ = await _mk(client)
    await client.put(f"/api/v1/observation/{o}/visibility", json={"visibility": "public"})
    await client.put(f"/api/v1/hypothesis/{h}/visibility", json={"visibility": "public"})
    await client.post(f"/api/v1/graph/links?from_type=observation&from_id={o}&to_type=hypothesis&to_id={h}&link_type=связано")
    await _login(client, "gm_b")
    item = (await _related(client, "observation", o))["hypothesis"][0]
    assert item["direct"] is True and item["can_edit"] is False
