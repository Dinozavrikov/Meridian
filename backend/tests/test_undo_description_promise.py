"""Обещание главной: изменили только описание гипотезы, прежний текст можно вернуть, пока описание не меняли снова."""
from app.db.session import AsyncSessionLocal
from app.models.entities import Hypothesis
from tests.conftest import create_test_user
from tests.test_undo import _history, _login, _undo, _with_field

FORM_FIELDS = ("name", "description", "falsification_criteria", "date_created", "status", "maturity",
               "tags", "visibility", "lab_id", "stability", "research_load", "risk")


async def _new_hypothesis(client, username):
    await create_test_user(username)
    await _login(client, username)
    r = await client.post("/api/v1/hypotheses/", json={
        "name": "Угол", "description": "<p>прежний текст</p>", "falsification_criteria": "стена сухая",
        "date_created": "2026-08-06", "status": "идея", "tags": ["дом"], "visibility": "private", "lab_id": None})
    assert r.status_code in (200, 201), r.text
    return r.json()


async def _save(client, current, **changes):
    """Как форма: весь набор полей из ответа сервера плюс правки."""
    body = {k: current[k] for k in FORM_FIELDS}
    body.update(changes)
    r = await client.put(f"/api/v1/hypotheses/{current['id']}", json=body)
    assert r.status_code == 200, r.text
    return r.json()


async def _stored(hid):
    async with AsyncSessionLocal() as db:
        h = await db.get(Hypothesis, hid)
        return h.description, h.status


async def _description_events(client, hid):
    return _with_field(await _history(client, "hypothesis", hid), "description")


async def test_description_only_edit_can_be_undone(client):
    h = await _new_hypothesis(client, "promise_one")
    await _save(client, h, description="<p>новый текст</p>")
    events = await _description_events(client, h["id"])
    assert len(events) == 1, events
    assert list(events[0]["changed_fields"]) == ["description"]
    assert events[0]["undoable"] is True, events[0]
    r = await _undo(client, "hypothesis", h["id"], events[0]["id"])
    assert r.status_code == 200, r.text
    assert await _stored(h["id"]) == ("<p>прежний текст</p>", "идея")


async def test_later_description_edit_blocks_earlier_undo(client):
    h = await _new_hypothesis(client, "promise_later")
    saved = await _save(client, h, description="<p>второй текст</p>")
    first_id = (await _description_events(client, h["id"]))[0]["id"]
    await _save(client, saved, description="<p>третий текст</p>")
    first = [e for e in await _description_events(client, h["id"]) if e["id"] == first_id][0]
    assert first["undoable"] is False, first
    r = await _undo(client, "hypothesis", h["id"], first_id)
    assert 400 <= r.status_code < 500, r.text
    assert (await _stored(h["id"]))[0] == "<p>третий текст</p>"


async def test_status_changed_together_blocks_undo(client):
    h = await _new_hypothesis(client, "promise_status")
    await _save(client, h, description="<p>новый текст</p>", status="активная проверка")
    events = await _description_events(client, h["id"])
    assert len(events) == 1 and "status" in events[0]["changed_fields"], events
    assert events[0]["undoable"] is False, events[0]
    r = await _undo(client, "hypothesis", h["id"], events[0]["id"])
    assert 400 <= r.status_code < 500, r.text
    assert await _stored(h["id"]) == ("<p>новый текст</p>", "активная проверка")
