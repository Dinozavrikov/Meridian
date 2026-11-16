"""Вкладки задачи/вопроса, открытых участнику через связь: читаются (200), но приватные гипотезы автора скрыты."""
import pytest

from tests.test_open_via_link import _login, _world

SECRET, VISIBLE = "SECRETNAME-hyp", "VISIBLENAME-hyp"


async def _hyp(client, name, **extra):
    body = {"name": name, "description": "d", "date_created": "2026-08-06", "status": "идея", **extra}
    r = await client.post("/api/v1/hypotheses/", json=body)
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


async def _setup(client, kind):
    a, b, c, lab, r, n = await _world(client)          # залогинен ov_a
    hs = await _hyp(client, SECRET, visibility="private")
    hl = await _hyp(client, VISIBLE, visibility="lab", lab_id=lab)
    if kind == "tasks":
        p = await client.post("/api/v1/tasks/", json={"name": "T", "visibility": "private"})
    else:
        p = await client.post("/api/v1/questions/", json={"title": "Q", "date_created": "2026-08-06", "visibility": "private"})
    assert p.status_code in (200, 201), p.text
    pid = p.json()["id"]
    resp = await client.post(f"/api/v1/{kind}/{pid}/hypotheses/{hs}")
    assert resp.status_code == 204, resp.text
    resp = await client.post(f"/api/v1/{kind}/{pid}/hypotheses/{hl}", params={"share": "lab"})
    assert resp.status_code == 204, resp.text
    return pid, hs, hl


CASES = [("tasks", "hypotheses"), ("tasks", "graph"), ("tasks", "competition"),
         ("questions", "hypotheses"), ("questions", "competition")]


@pytest.mark.asyncio
@pytest.mark.parametrize("kind,tab", CASES)
async def test_opened_parent_tabs_readable_nested_filtered(client, kind, tab):
    pid, hs, hl = await _setup(client, kind)
    await _login(client, "ov_b")
    resp = await client.get(f"/api/v1/{kind}/{pid}/{tab}")
    assert resp.status_code == 200, resp.text           # КРАСНЫЙ на старом коде: сейчас 403
    assert VISIBLE in resp.text, resp.text
    assert SECRET not in resp.text, resp.text


@pytest.mark.asyncio
async def test_opened_task_scales_readable_nested_filtered(client):
    pid, hs, hl = await _setup(client, "tasks")
    resp = await client.post(f"/api/v1/tasks/{pid}/scales", json={"name": "S", "hypothesis_ids": [hs, hl]})
    assert resp.status_code == 201, resp.text
    await _login(client, "ov_b")
    resp = await client.get(f"/api/v1/tasks/{pid}/scales")
    assert resp.status_code == 200, resp.text
    ids = resp.json()[0]["hypothesis_ids"]
    assert hl in ids and hs not in ids, ids
