"""Откат правки поля (services/undo.py, api/v1/undo.py): allowlist, конфликт по значению,
owner-only, история. Юнит-часть — evaluate_undo/apply_undo на транзиентных ORM-объектах
(без БД-записей и HTTP); интеграционная — через настоящие PUT, чтобы события рождал
before_flush-листенер, а не тест."""
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
from sqlalchemy import select

from app.db.session import AsyncSessionLocal
from app.models.entities import Event, Observation, Prediction
from app.services.undo import apply_undo, evaluate_undo
from tests.conftest import create_test_user


# ── юнит-часть ────────────────────────────────────────────────────────────────

def _ev(changed, *, type="updated", id=1):
    return SimpleNamespace(id=id, type=type, meta={"changed_fields": changed})


def _obs(**kw):
    base = dict(date="2026-09-28", author="a", title="B", text="t", importance=0)
    return Observation(**{**base, **kw})


def _pred(**kw):
    base = dict(title="", text="t", date_created="2026-09-28", status="не проверен",
                expected_check_date=datetime(2026, 10, 1, 9, 0, tzinfo=timezone.utc),
                confidence=80, result_notes="")
    return Prediction(**{**base, **kw})


def test_unit_ok_when_current_equals_new():
    v = evaluate_undo(_obs(title="B"), "observation", _ev({"title": {"old": "A", "new": "B"}}))
    assert v.ok and v.code is None


def test_unit_conflict_when_value_changed_since():
    v = evaluate_undo(_obs(title="C"), "observation", _ev({"title": {"old": "A", "new": "B"}}))
    assert (v.ok, v.code, v.fields) == (False, "conflict", ("title",))


def test_unit_field_outside_allowlist_blocks_whole_event():
    ev = _ev({"title": {"old": "A", "new": "B"}, "status": {"old": "x", "new": "y"}})
    v = evaluate_undo(_obs(title="B", status="y"), "observation", ev)
    assert (v.ok, v.code, v.fields) == (False, "field_not_undoable", ("status",))


@pytest.mark.parametrize("field", ["deleted_at", "slug", "status"])   # visibility/lab_id откатываются отдельным путём — test_undo_visibility.py
def test_unit_service_fields_never_undoable(field):
    v = evaluate_undo(_obs(), "observation", _ev({field: {"old": None, "new": "x"}}))
    assert v.code == "field_not_undoable" and v.fields == (field,)


def test_unit_non_updated_event_rejected():
    v = evaluate_undo(_obs(), "observation", _ev({"title": {"old": "A", "new": "B"}}, type="status_changed"))
    assert v.code == "not_updated_event"


@pytest.mark.parametrize("meta", [{}, {"changed_fields": {}}, {"changed_fields": {"title": "oops"}},
                                  {"changed_fields": {"title": {"old": "A"}}}])
def test_unit_malformed_meta_rejected(meta):
    v = evaluate_undo(_obs(), "observation", SimpleNamespace(id=1, type="updated", meta=meta))
    assert v.code == "malformed_event"


def test_unit_datetime_offsets_do_not_produce_false_conflict():
    # в событии +03:00, из БД приходит UTC — один и тот же момент времени
    obj = _pred(expected_check_date=datetime(2026, 10, 1, 9, 0, tzinfo=timezone.utc))
    ev = _ev({"expected_check_date": {"old": "2026-09-01T00:00:00+00:00", "new": "2026-10-01T12:00:00+03:00"}})
    assert evaluate_undo(obj, "prediction", ev).ok
    assert apply_undo(obj, ev) == ["expected_check_date"]
    assert obj.expected_check_date == datetime(2026, 9, 1, tzinfo=timezone.utc)


def test_unit_naive_datetime_in_event_treated_as_utc():
    ev = _ev({"expected_check_date": {"old": "2026-09-01T00:00:00", "new": "2026-10-01T09:00:00"}})
    assert evaluate_undo(_pred(), "prediction", ev).ok


def test_unit_closed_prediction_confidence_blocked_but_other_fields_ok():
    conf = _ev({"confidence": {"old": 60, "new": 80}})
    v = evaluate_undo(_pred(status="подтвердился"), "prediction", conf)
    assert (v.ok, v.code, v.fields) == (False, "prediction_closed", ("confidence",))
    assert evaluate_undo(_pred(status="не проверен"), "prediction", conf).ok
    notes = _ev({"result_notes": {"old": "", "new": "n"}})
    assert evaluate_undo(_pred(status="подтвердился", result_notes="n"), "prediction", notes).ok


# ── интеграционная часть ──────────────────────────────────────────────────────

async def _login(client, username, password="pass12345"):
    r = await client.post("/api/v1/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200, r.text


_OBS = {"date": "2026-09-28", "author": "tester", "title": "A", "text": "body", "importance": 0,
        "status": "осмысленное", "visibility": "private", "lab_id": None, "tags": []}
_PRED = {"title": "p", "text": "will happen", "date_created": "2026-09-28",
         "expected_check_date": "2026-12-01T00:00:00Z", "hypothesis_id": None, "status": "не проверен",
         "confidence": 60, "result_notes": "", "visibility": "private", "lab_id": None,
         "confirms_hypothesis_if_true": True}


async def _new_obs(client, **over):
    r = await client.post("/api/v1/observations/", json={**_OBS, **over})
    assert r.status_code == 201, r.text
    return r.json()


async def _edit_obs(client, oid, **over):
    r = await client.put(f"/api/v1/observations/{oid}", json={**_OBS, **over})
    assert r.status_code == 200, r.text
    return r.json()


async def _new_pred(client, **over):
    r = await client.post("/api/v1/predictions/", json={**_PRED, **over})
    assert r.status_code in (200, 201), r.text
    return r.json()


async def _put_pred(client, pid, **over):
    return await client.put(f"/api/v1/predictions/{pid}", json={**_PRED, **over})


async def _history(client, etype, eid):
    r = await client.get(f"/api/v1/{etype}/{eid}/history")
    assert r.status_code == 200, r.text
    return r.json()


def _with_field(history, field):
    return [h for h in history if field in h["changed_fields"]]


def _undo(client, etype, eid, event_id):
    return client.post(f"/api/v1/{etype}/{eid}/undo/{event_id}")


async def _title(client, oid):
    return (await client.get(f"/api/v1/observations/{oid}")).json()["title"]


@pytest.mark.asyncio
async def test_undo_reverts_field_and_logs_updated_and_undone(client):
    await create_test_user("undo_u1")
    await _login(client, "undo_u1")
    obs = await _new_obs(client)
    await _edit_obs(client, obs["id"], title="B")

    ev = _with_field(await _history(client, "observation", obs["id"]), "title")[0]
    assert ev["undoable"] is True and ev["blocked_code"] is None

    r = await _undo(client, "observation", obs["id"], ev["id"])
    assert r.status_code == 200, r.text
    assert r.json() == {"reverted_event_id": ev["id"], "fields": ["title"]}
    assert await _title(client, obs["id"]) == "A"

    hist = await _history(client, "observation", obs["id"])
    titles = _with_field(hist, "title")
    assert len(titles) == 2  # исходная правка + generic updated от самого undo
    assert titles[0]["changed_fields"]["title"] == {"old": "B", "new": "A"}
    assert next(h for h in hist if h["id"] == ev["id"])["reverted"] is True

    async with AsyncSessionLocal() as s:
        markers = (await s.execute(select(Event).where(
            Event.type == "undone", Event.entity_type == "observation", Event.entity_id == obs["id"]
        ))).scalars().all()
    assert len(markers) == 1 and markers[0].meta["reverted_event_id"] == ev["id"]


@pytest.mark.asyncio
async def test_later_change_blocks_older_undo_until_newer_is_undone(client):
    await create_test_user("undo_u2")
    await _login(client, "undo_u2")
    obs = await _new_obs(client)
    await _edit_obs(client, obs["id"], title="B")
    await _edit_obs(client, obs["id"], title="C")

    e_new, e_old = _with_field(await _history(client, "observation", obs["id"]), "title")
    assert e_new["undoable"] is True
    assert (e_old["undoable"], e_old["blocked_code"], e_old["blocked_fields"]) == (False, "conflict", ["title"])

    r = await _undo(client, "observation", obs["id"], e_old["id"])
    assert r.status_code == 409 and r.json()["detail"] == {"code": "conflict", "fields": ["title"]}
    assert await _title(client, obs["id"]) == "C"  # молчаливой потери данных нет

    assert (await _undo(client, "observation", obs["id"], e_new["id"])).status_code == 200
    assert await _title(client, obs["id"]) == "B"
    assert (await _undo(client, "observation", obs["id"], e_old["id"])).status_code == 200
    assert await _title(client, obs["id"]) == "A"


@pytest.mark.asyncio
async def test_event_with_non_allowlisted_field_is_blocked_entirely(client):
    await create_test_user("undo_u3")
    await _login(client, "undo_u3")
    obs = await _new_obs(client)
    await _edit_obs(client, obs["id"], title="B", status="интегрированное")

    ev = _with_field(await _history(client, "observation", obs["id"]), "title")[0]
    assert (ev["undoable"], ev["blocked_code"], ev["blocked_fields"]) == (False, "field_not_undoable", ["status"])
    r = await _undo(client, "observation", obs["id"], ev["id"])
    assert r.status_code == 409 and r.json()["detail"]["code"] == "field_not_undoable"
    assert await _title(client, obs["id"]) == "B"  # частичного отката нет


@pytest.mark.asyncio
async def test_other_user_and_foreign_event_get_404(client):
    await create_test_user("undo_owner")
    await create_test_user("undo_other")
    await _login(client, "undo_owner")
    obs = await _new_obs(client)
    await _edit_obs(client, obs["id"], title="B")
    ev_id = _with_field(await _history(client, "observation", obs["id"]), "title")[0]["id"]

    await _login(client, "undo_other")
    assert (await _undo(client, "observation", obs["id"], ev_id)).status_code == 404
    assert (await client.get(f"/api/v1/observation/{obs['id']}/history")).status_code == 404
    mine = await _new_obs(client, title="mine")
    # событие чужой сущности по угаданному id под СВОЕЙ записью
    assert (await _undo(client, "observation", mine["id"], ev_id)).status_code == 404

    await _login(client, "undo_owner")
    assert await _title(client, obs["id"]) == "B"


@pytest.mark.asyncio
async def test_trashed_entity_is_404(client):
    await create_test_user("undo_u4")
    await _login(client, "undo_u4")
    obs = await _new_obs(client)
    await _edit_obs(client, obs["id"], title="B")
    ev_id = _with_field(await _history(client, "observation", obs["id"]), "title")[0]["id"]

    assert (await client.delete(f"/api/v1/observations/{obs['id']}")).status_code == 204
    assert (await _undo(client, "observation", obs["id"], ev_id)).status_code == 404
    assert (await client.get(f"/api/v1/observation/{obs['id']}/history")).status_code == 404


@pytest.mark.asyncio
async def test_non_updated_event_is_400_and_bad_entity_type_is_400(client):
    await create_test_user("undo_u5")
    await _login(client, "undo_u5")
    obs = await _new_obs(client)
    async with AsyncSessionLocal() as s:
        created = (await s.execute(select(Event).where(
            Event.type == "created", Event.entity_type == "observation", Event.entity_id == obs["id"]
        ))).scalars().first()
    r = await _undo(client, "observation", obs["id"], created.id)
    assert r.status_code == 400 and r.json()["detail"]["code"] == "not_updated_event"
    assert (await _undo(client, "attachment", obs["id"], created.id)).status_code == 400


@pytest.mark.asyncio
async def test_datetime_field_roundtrip_has_no_false_conflict(client):
    await create_test_user("undo_u6")
    await _login(client, "undo_u6")
    pred = await _new_pred(client)
    r = await _put_pred(client, pred["id"], expected_check_date="2026-12-01T12:00:00+03:00")
    assert r.status_code == 200, r.text

    ev = _with_field(await _history(client, "prediction", pred["id"]), "expected_check_date")[0]
    assert ev["undoable"] is True
    assert (await _undo(client, "prediction", pred["id"], ev["id"])).status_code == 200
    got = (await client.get(f"/api/v1/predictions/{pred['id']}")).json()["expected_check_date"]
    assert datetime.fromisoformat(got) == datetime(2026, 12, 1, tzinfo=timezone.utc)


@pytest.mark.asyncio
async def test_closed_prediction_confidence_protected_in_put_and_undo(client):
    await create_test_user("undo_u7")
    await _login(client, "undo_u7")
    pred = await _new_pred(client)
    assert (await _put_pred(client, pred["id"], confidence=80)).status_code == 200
    ev = _with_field(await _history(client, "prediction", pred["id"]), "confidence")[0]
    assert ev["undoable"] is True  # пока прогноз открыт — откат свободен

    r = await client.put(f"/api/v1/predictions/{pred['id']}/close",
                         json={"status": "подтвердился", "result_notes": ""})
    assert r.status_code == 200, r.text

    ev = _with_field(await _history(client, "prediction", pred["id"]), "confidence")[0]
    assert (ev["undoable"], ev["blocked_code"]) == (False, "prediction_closed")
    r = await _undo(client, "prediction", pred["id"], ev["id"])
    assert r.status_code == 409 and r.json()["detail"]["code"] == "prediction_closed"

    closed = {"status": "подтвердился"}
    assert (await _put_pred(client, pred["id"], confidence=10, **closed)).status_code == 400
    ok = await _put_pred(client, pred["id"], confidence=80, result_notes="note", **closed)
    assert ok.status_code == 200, ok.text  # правка других полей закрытого — как раньше
