"""Вкладки лабораторной задачи/вопроса не показывают участнику приватную гипотезу автора, привязанную с share=me."""
import pytest

from tests.test_open_via_link import _login, _world

SECRET = "SECRETNAME-hyp"


async def _setup(client, kind):
    a, b, c, lab, r, n = await _world(client)          # залогинен ov_a
    h = await client.post("/api/v1/hypotheses/", json={"name": SECRET, "description": "d", "date_created": "2026-08-06",
                                                       "status": "идея", "visibility": "private"})
    assert h.status_code in (200, 201), h.text
    hid = h.json()["id"]
    if kind == "tasks":
        p = await client.post("/api/v1/tasks/", json={"name": "T", "visibility": "lab", "lab_id": lab})
    else:
        p = await client.post("/api/v1/questions/", json={"title": "Q", "date_created": "2026-08-06", "visibility": "lab", "lab_id": lab})
    assert p.status_code in (200, 201), p.text
    pid = p.json()["id"]
    resp = await client.post(f"/api/v1/{kind}/{pid}/hypotheses/{hid}", params={"share": "me"})
    assert resp.status_code == 204, resp.text
    return pid


CASES = [("tasks", "hypotheses"), ("tasks", "graph"), ("tasks", "competition"),
         ("questions", "hypotheses"), ("questions", "competition")]


@pytest.mark.asyncio
@pytest.mark.parametrize("kind,tab", CASES)
async def test_member_does_not_see_private_nested_hyp(client, kind, tab):
    pid = await _setup(client, kind)
    await _login(client, "ov_b")
    resp = await client.get(f"/api/v1/{kind}/{pid}/{tab}")
    assert resp.status_code == 200, resp.text           # родитель доступен: падение ниже — это утечка, не фикстура
    assert SECRET not in resp.text, resp.text           # КРАСНЫЙ на старом коде


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["tasks", "questions"])
async def test_owner_still_sees_own_nested_hyp(client, kind):
    """ОХРАННЫЙ (зелёный до патча): владелец гипотезы видит её во вкладке."""
    pid = await _setup(client, kind)
    resp = await client.get(f"/api/v1/{kind}/{pid}/hypotheses")
    assert resp.status_code == 200 and SECRET in resp.text, resp.text
