"""Один PUT со сменой контента и видимости пишет ОДНО событие updated: иначе откат части события
(content) обходит защиту «событие с неоткатываемым полем блокируется целиком» (регрессия e7d9aa7:
reset_shares_on_visibility_change делал execute, автосброс разрезал изменения на два события)."""
import pytest
from tests.conftest import create_test_user
from tests.test_undo import _PRED, _edit_obs, _history, _login, _new_obs, _new_pred


def _events_with(history, field):
    return [h for h in history if field in h["changed_fields"]]


def _assert_single_event(history, content_field):
    with_content = _events_with(history, content_field)
    with_vis = _events_with(history, "visibility")
    assert len(with_content) == 1 and len(with_vis) == 1, [h["changed_fields"] for h in history]
    assert with_content[0]["id"] == with_vis[0]["id"], "контент и видимость ушли в разные события"
    # Видимость теперь откатывается (парой с лабой), поэтому событие «контент + видимость» откатываемо целиком;
    # что откат тоже даёт ОДНО событие updated, проверяет test_undo_visibility.py.
    assert with_content[0]["undoable"] is True and with_content[0]["blocked_fields"] == []


@pytest.mark.asyncio
async def test_observation_put_content_and_visibility_one_event(client):
    await create_test_user("one_ev_obs")
    await _login(client, "one_ev_obs")
    obs = await _new_obs(client)
    await _edit_obs(client, obs["id"], title="B", visibility="public")
    _assert_single_event(await _history(client, "observation", obs["id"]), "title")


@pytest.mark.asyncio
async def test_prediction_put_content_and_visibility_one_event(client):
    await create_test_user("one_ev_pred")
    await _login(client, "one_ev_pred")
    pred = await _new_pred(client)
    r = await client.put(f"/api/v1/predictions/{pred['id']}", json={**_PRED, "title": "B", "visibility": "public"})
    assert r.status_code == 200, r.text
    _assert_single_event(await _history(client, "prediction", pred["id"]), "title")


_CASES = {
    "hypothesis": ("/api/v1/hypotheses/", {"name": "A", "description": "", "date_created": "2026-09-28", "status": "идея", "visibility": "private"}, "name"),
    "question":   ("/api/v1/questions/",  {"title": "A", "date_created": "2026-09-28", "visibility": "private"}, "title"),
    "task":       ("/api/v1/tasks/",      {"name": "A", "visibility": "private"}, "name"),
    "worldview":  ("/api/v1/worldview/",  {"date": "2026-09-28", "belief": "A", "visibility": "private"}, "belief"),
}


@pytest.mark.asyncio
@pytest.mark.parametrize("etype", list(_CASES))
async def test_put_content_and_visibility_one_event(client, etype):
    url, body, field = _CASES[etype]
    await create_test_user(f"one_ev_{etype}")
    await _login(client, f"one_ev_{etype}")
    r = await client.post(url, json=body)
    assert r.status_code in (200, 201), r.text
    eid = r.json()["id"]
    r = await client.put(f"{url}{eid}", json={**body, field: "B", "visibility": "public"})
    assert r.status_code == 200, r.text
    _assert_single_event(await _history(client, etype, eid), field)
