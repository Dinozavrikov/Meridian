"""Откат смены видимости: services/undo.py (VISIBILITY_FIELDS, VisibilityContext) и api/v1/undo.py.
Откат идёт теми же правилами, что обычная смена видимости, и пишет visibility_changed: голое присваивание
вернуло бы запись в ленту мимо события и без снятия согласий."""
from types import SimpleNamespace

import pytest
from sqlalchemy import delete, select

from app.core.lab_access import visibility_from_lab
from app.models.entities import Event
from app.models.social import Lab, LabMember
from app.services.undo import VisibilityContext, apply_undo, evaluate_undo
from tests.conftest import AsyncSessionLocal, create_test_user
from tests.test_feed_groups_api import _create_hyp, _create_lab, _flat, _get, _hyp_body, _login, _set
from tests.test_undo import _history, _new_pred, _obs, _pred


# ── юнит-часть: чистая функция ────────────────────────────────────────────────

def _ev(changed, id=1):
    return SimpleNamespace(id=id, type="updated", meta={"changed_fields": changed})


def _move_out_event(lab_id, was_public):
    return _ev({"visibility": {"old": visibility_from_lab(was_public), "new": "private"},
                "lab_id": {"old": lab_id, "new": None}})


def test_unit_publication_without_lab_is_undoable_and_apply_leaves_visibility_to_the_endpoint():
    obj = _obs(visibility="public", lab_id=None)
    ev = _ev({"visibility": {"old": "private", "new": "public"}})
    assert evaluate_undo(obj, "observation", ev).ok
    assert apply_undo(obj, ev) == ["visibility"]
    assert obj.visibility == "public", "видимость присваивает эндпоинт через reset_shares_on_visibility_change, не apply_undo"


def test_unit_conflict_when_visibility_changed_again():
    obj = _obs(visibility="private", lab_id=None)
    v = evaluate_undo(obj, "observation", _ev({"visibility": {"old": "private", "new": "public"}}))
    assert (v.ok, v.code, v.fields) == (False, "conflict", ("visibility",))


def test_unit_return_to_lab_ok_when_lab_unchanged_and_user_is_member():
    obj = _obs(visibility="private", lab_id=None)
    ctx = VisibilityContext({7: False}, frozenset({7}))
    assert evaluate_undo(obj, "observation", _move_out_event(7, False), None, ctx).ok


def test_unit_return_to_lab_blocked_when_lab_became_public_or_gone():
    obj = _obs(visibility="private", lab_id=None)
    became_public = VisibilityContext({7: True}, frozenset({7}))
    assert evaluate_undo(obj, "observation", _move_out_event(7, False), None, became_public).code == "lab_state_changed"
    for ctx in (VisibilityContext({}, frozenset()), None):   # лаборатории нет / состояние не передано — безопасный отказ
        assert evaluate_undo(obj, "observation", _move_out_event(7, False), None, ctx).code == "lab_state_changed"


def test_unit_return_to_lab_blocked_when_user_left_the_lab():
    obj = _obs(visibility="private", lab_id=None)
    ctx = VisibilityContext({7: False}, frozenset())
    v = evaluate_undo(obj, "observation", _move_out_event(7, False), None, ctx)
    assert (v.ok, v.code, v.fields) == (False, "not_lab_member", ("lab_id",))


def test_unit_closed_prediction_visibility_undo_blocked_open_one_ok():
    ev = _ev({"visibility": {"old": "public", "new": "private"}})
    v = evaluate_undo(_pred(status="подтвердился", visibility="private"), "prediction", ev)
    assert (v.ok, v.code, v.fields) == (False, "prediction_closed", ("visibility",))
    assert evaluate_undo(_pred(status="не проверен", visibility="private"), "prediction", ev).ok


# ── интеграция: настоящие маршруты ────────────────────────────────────────────

def _vis(etype, eid):
    return f"/api/v1/{etype}/{eid}/visibility"


async def _events(etype, eid, typ):
    async with AsyncSessionLocal() as s:
        return (await s.execute(select(Event).where(
            Event.type == typ, Event.entity_type == etype, Event.entity_id == eid).order_by(Event.id))).scalars().all()


def _with_visibility(history, new=None):
    items = [h for h in history if "visibility" in h["changed_fields"]
             and (new is None or h["changed_fields"]["visibility"]["new"] == new)]
    assert len(items) == 1, [h["changed_fields"] for h in history]
    return items[0]


@pytest.mark.asyncio
async def test_undo_publication_removes_record_from_public_feed_and_writes_event(client):
    await create_test_user("uv_pub")
    await _login(client, "uv_pub")
    hyp = await _create_hyp(client, "Undo pub", "private")
    key = ("hypothesis", hyp["id"])
    assert (await client.put(_vis(*key), json={"visibility": "public"})).status_code == 200
    assert key in _flat(await _get(client)), "предусловие: запись опубликована и видна"
    ev = _with_visibility(await _history(client, *key))
    assert ev["undoable"] is True

    r = await client.post(f"/api/v1/hypothesis/{hyp['id']}/undo/{ev['id']}")
    assert r.status_code == 200, r.text
    assert key not in _flat(await _get(client))
    assert (await client.get(f"/api/v1/hypotheses/{hyp['id']}")).json()["visibility"] == "private"
    evs = await _events(*key, "visibility_changed")
    assert [e.meta["new_visibility"] for e in evs] == ["public", "private"]
    assert evs[1].meta["reverts_event_id"] == ev["id"]
    assert evs[1].visibility == "private" and evs[1].lab_id is None, "сокрытие не должно светиться в публичной ленте"


@pytest.mark.asyncio
async def test_undo_of_content_and_visibility_writes_exactly_one_updated_event(client):
    """Регрессия e7d9aa7: execute внутри reset_shares_on_visibility_change делает автосброс и режет изменения на два события."""
    await create_test_user("uv_one")
    await _login(client, "uv_one")
    hyp = await _create_hyp(client, "Title A", "private")
    key = ("hypothesis", hyp["id"])
    assert (await client.put(f"/api/v1/hypotheses/{hyp['id']}", json=_hyp_body("Title B", "public"))).status_code == 200
    before = len(await _events(*key, "updated"))
    ev = _with_visibility(await _history(client, *key))
    assert ev["undoable"] is True and "name" in ev["changed_fields"], "предусловие: в одном событии и контент, и видимость"

    r = await client.post(f"/api/v1/hypothesis/{hyp['id']}/undo/{ev['id']}")
    assert r.status_code == 200, r.text
    assert len(await _events(*key, "updated")) == before + 1, "откат разрезал изменения на два события"
    got = (await client.get(f"/api/v1/hypotheses/{hyp['id']}")).json()
    assert got["name"] == "Title A" and got["visibility"] == "private"


@pytest.mark.asyncio
async def test_undo_rejected_when_visibility_changed_again(client):
    await create_test_user("uv_conf")
    await _login(client, "uv_conf")
    hyp = await _create_hyp(client, "Conflict", "private")
    key = ("hypothesis", hyp["id"])
    for v in ("public", "private"):
        assert (await client.put(_vis(*key), json={"visibility": v})).status_code == 200
    ev = _with_visibility(await _history(client, *key), new="public")
    assert ev["undoable"] is False and ev["blocked_code"] == "conflict"
    r = await client.post(f"/api/v1/hypothesis/{hyp['id']}/undo/{ev['id']}")
    assert r.status_code == 409 and r.json()["detail"]["code"] == "conflict"


@pytest.mark.asyncio
async def test_closed_prediction_visibility_undo_is_blocked(client):
    await create_test_user("uv_pred")
    await _login(client, "uv_pred")
    pred = await _new_pred(client)
    key = ("prediction", pred["id"])
    assert (await client.put(_vis(*key), json={"visibility": "public"})).status_code == 200
    await _set("prediction", pred["id"], status="подтвердился")   # закрыт позже: вклад уже учтён
    ev = _with_visibility(await _history(client, *key))
    assert ev["undoable"] is False and ev["blocked_code"] == "prediction_closed"
    r = await client.post(f"/api/v1/prediction/{pred['id']}/undo/{ev['id']}")
    assert r.status_code == 409 and r.json()["detail"]["code"] == "prediction_closed"
    assert (await client.get(f"/api/v1/predictions/{pred['id']}")).json()["visibility"] == "public"


async def _moved_out_of_lab(client, username):
    """Запись в закрытой лаборатории, затем выведена в private: событие updated несёт visibility и lab_id."""
    await create_test_user(username)
    await _login(client, username)
    lab = await _create_lab(client, f"UV lab {username}", False)
    hyp = await _create_hyp(client, f"In lab {username}", "private", lab_id=lab["id"])
    key = ("hypothesis", hyp["id"])
    inside = (await client.get(f"/api/v1/hypotheses/{hyp['id']}")).json()
    assert inside["lab_id"] == lab["id"] and inside["visibility"] == visibility_from_lab(False), "предусловие: запись в лаборатории"
    assert (await client.put(_vis(*key), json={"visibility": "private"})).status_code == 200
    ev = _with_visibility(await _history(client, *key))
    assert "lab_id" in ev["changed_fields"]
    return lab, hyp, key, ev


@pytest.mark.asyncio
async def test_undo_move_out_of_lab_returns_record_to_the_lab(client):
    lab, hyp, key, ev = await _moved_out_of_lab(client, "uv_lab_ok")
    assert ev["undoable"] is True
    r = await client.post(f"/api/v1/hypothesis/{hyp['id']}/undo/{ev['id']}")
    assert r.status_code == 200, r.text
    got = (await client.get(f"/api/v1/hypotheses/{hyp['id']}")).json()
    assert got["lab_id"] == lab["id"] and got["visibility"] == visibility_from_lab(False)


@pytest.mark.asyncio
async def test_undo_blocked_when_lab_became_public_meanwhile(client):
    lab, hyp, key, ev = await _moved_out_of_lab(client, "uv_lab_pub")
    async with AsyncSessionLocal() as s:
        (await s.get(Lab, lab["id"])).is_public = True
        await s.commit()
    ev = _with_visibility(await _history(client, *key))
    assert ev["undoable"] is False and ev["blocked_code"] == "lab_state_changed"
    r = await client.post(f"/api/v1/hypothesis/{hyp['id']}/undo/{ev['id']}")
    assert r.status_code == 409 and r.json()["detail"]["code"] == "lab_state_changed"
    assert (await client.get(f"/api/v1/hypotheses/{hyp['id']}")).json()["lab_id"] is None


@pytest.mark.asyncio
async def test_undo_blocked_when_user_left_the_lab(client):
    lab, hyp, key, ev = await _moved_out_of_lab(client, "uv_lab_left")
    async with AsyncSessionLocal() as s:
        await s.execute(delete(LabMember).where(LabMember.lab_id == lab["id"]))
        await s.commit()
    ev = _with_visibility(await _history(client, *key))
    assert ev["undoable"] is False and ev["blocked_code"] == "not_lab_member"
    r = await client.post(f"/api/v1/hypothesis/{hyp['id']}/undo/{ev['id']}")
    assert r.status_code == 409 and r.json()["detail"]["code"] == "not_lab_member"
    assert (await client.get(f"/api/v1/hypotheses/{hyp['id']}")).json()["lab_id"] is None
