"""История и откат значений шкал (scale_values): события пишутся при PUT /scales/values,
откатываются тем же эндпоинтом undo, вердикт — evaluate_undo. Интеграционные тесты идут через
настоящий HTTP и проверяют итоговое состояние (GET /scales/values), а не только событие."""
import pytest
from sqlalchemy import select

from app.db.session import AsyncSessionLocal
from app.models.entities import ScaleDef
from app.models.user import User
from app.services.undo import ScaleContext, apply_undo, evaluate_undo, scale_undo_values
from tests.conftest import create_test_user
from tests.test_undo import _ev, _history, _login, _new_obs, _obs, _undo, _with_field


async def _new_scale(username: str, name: str = "Моя шкала") -> int:
    async with AsyncSessionLocal() as db:
        uid = (await db.execute(select(User.id).where(User.username == username))).scalar_one()
        sd = ScaleDef(user_id=uid, entity_type="observation", name=name, description="",
                      min_val=0, max_val=10, step=1, group_by="none", color="#4A90D9", levels="[]")
        db.add(sd)
        await db.flush()
        sid = sd.id
        await db.commit()
        return sid


def _put_scale(client, etype, eid, scale_id, value):
    return client.put("/api/v1/scales/values",
                      json={"entity_type": etype, "entity_id": eid, "scale_id": scale_id, "value": value})


async def _values(client, etype, eid):
    r = await client.get("/api/v1/scales/values", params={"entity_type": etype, "entity_id": eid})
    assert r.status_code == 200, r.text
    return r.json()


# ── интеграция ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_custom_scale_history_and_undo_chain(client):
    await create_test_user("undo_s1")
    await _login(client, "undo_s1")
    obs = await _new_obs(client)
    key = f"custom_{await _new_scale('undo_s1')}"
    fk = f"scale:{key}"

    assert (await _put_scale(client, "observation", obs["id"], key, 7)).status_code == 200
    assert (await _put_scale(client, "observation", obs["id"], key, 9)).status_code == 200

    e2, e1 = _with_field(await _history(client, "observation", obs["id"]), fk)  # новые первыми
    assert e1["changed_fields"][fk] == {"old": None, "new": 7.0}
    assert e2["changed_fields"][fk] == {"old": 7.0, "new": 9.0}
    assert e2["undoable"] is True
    assert (e1["undoable"], e1["blocked_code"], e1["blocked_fields"]) == (False, "conflict", [fk])

    r = await _undo(client, "observation", obs["id"], e2["id"])
    assert r.status_code == 200 and r.json()["fields"] == [fk]
    assert await _values(client, "observation", obs["id"]) == {key: 7.0}

    hist = _with_field(await _history(client, "observation", obs["id"]), fk)
    by_id = {h["id"]: h for h in hist}
    assert by_id[e2["id"]]["reverted"] is True and by_id[e2["id"]]["undoable"] is False
    assert by_id[e1["id"]]["undoable"] is True      # значение снова равно «new» из E1
    redo = hist[0]                                   # сам откат — обычная правка, его тоже можно вернуть
    assert redo["id"] not in (e1["id"], e2["id"])
    assert redo["changed_fields"][fk] == {"old": 9.0, "new": 7.0} and redo["undoable"] is True

    assert (await _undo(client, "observation", obs["id"], e1["id"])).status_code == 200
    assert await _values(client, "observation", obs["id"]) == {}


@pytest.mark.asyncio
async def test_unchanged_value_writes_no_event_and_reset_is_undoable(client):
    await create_test_user("undo_s2")
    await _login(client, "undo_s2")
    obs = await _new_obs(client)
    key = f"custom_{await _new_scale('undo_s2')}"
    fk = f"scale:{key}"

    assert (await _put_scale(client, "observation", obs["id"], key, 5)).status_code == 200
    assert (await _put_scale(client, "observation", obs["id"], key, 5)).status_code == 200
    assert len(_with_field(await _history(client, "observation", obs["id"]), fk)) == 1

    r = await _put_scale(client, "observation", obs["id"], key, None)   # сброс
    assert r.status_code == 200 and r.json() is None
    assert await _values(client, "observation", obs["id"]) == {}
    r = await _put_scale(client, "observation", obs["id"], key, None)   # сброс уже пустого
    assert r.status_code == 200 and r.json() is None

    hist = _with_field(await _history(client, "observation", obs["id"]), fk)
    assert len(hist) == 2
    assert hist[0]["changed_fields"][fk] == {"old": 5.0, "new": None} and hist[0]["undoable"] is True

    assert (await _undo(client, "observation", obs["id"], hist[0]["id"])).status_code == 200
    assert await _values(client, "observation", obs["id"]) == {key: 5.0}


@pytest.mark.asyncio
async def test_deleted_scale_blocks_undo_and_no_orphan_row(client):
    await create_test_user("undo_s3")
    await _login(client, "undo_s3")
    obs = await _new_obs(client)
    sid = await _new_scale("undo_s3")
    key, fk = f"custom_{sid}", f"scale:custom_{sid}"
    assert (await _put_scale(client, "observation", obs["id"], key, 4)).status_code == 200

    assert (await client.delete(f"/api/v1/scales/defs/{sid}")).status_code == 204

    ev = _with_field(await _history(client, "observation", obs["id"]), fk)[0]
    assert (ev["undoable"], ev["blocked_code"], ev["blocked_fields"]) == (False, "scale_missing", [fk])
    r = await _undo(client, "observation", obs["id"], ev["id"])
    assert r.status_code == 409 and r.json()["detail"] == {"code": "scale_missing", "fields": [fk]}
    assert await _values(client, "observation", obs["id"]) == {}   # строка-сирота не воскресла


@pytest.mark.asyncio
async def test_builtin_scale_id_does_not_collide_with_column(client):
    await create_test_user("undo_s4")
    await _login(client, "undo_s4")
    obs = await _new_obs(client)           # колонка importance = 0

    assert (await _put_scale(client, "observation", obs["id"], "importance", 7)).status_code == 200
    ev = _with_field(await _history(client, "observation", obs["id"]), "scale:importance")[0]
    assert "importance" not in ev["changed_fields"] and ev["undoable"] is True

    assert (await _undo(client, "observation", obs["id"], ev["id"])).status_code == 200
    assert await _values(client, "observation", obs["id"]) == {}
    got = (await client.get(f"/api/v1/observations/{obs['id']}")).json()
    assert got["importance"] == 0          # колонку откат шкалы не тронул


@pytest.mark.asyncio
async def test_set_value_rejects_foreign_missing_and_oversized_scale_ids(client):
    await create_test_user("undo_s5a")
    await create_test_user("undo_s5b")
    foreign = f"custom_{await _new_scale('undo_s5b')}"
    await _login(client, "undo_s5a")
    obs = await _new_obs(client)

    for bad in [foreign, "custom_999999", "custom_abc", "custom_99999999999999999999", "x" * 65]:
        r = await _put_scale(client, "observation", obs["id"], bad, 3)
        assert r.status_code == 400, (bad, r.status_code, r.text)

    assert await _values(client, "observation", obs["id"]) == {}
    hist = await _history(client, "observation", obs["id"])
    assert not any(k.startswith("scale:") for h in hist for k in h["changed_fields"])


# ── юнит-часть: вердикт ───────────────────────────────────────────────────────

def _scale_ev(sid, old, new):
    return _ev({f"scale:{sid}": {"old": old, "new": new}})


def _ctx(values=None, custom=()):
    return ScaleContext(dict(values or {}), frozenset(custom))


def test_unit_scale_ok_conflict_missing():
    ev = _scale_ev("custom_1", 5.0, 7.0)
    assert evaluate_undo(_obs(), "observation", ev, _ctx({"custom_1": 7.0}, {"custom_1"})).ok
    v = evaluate_undo(_obs(), "observation", ev, _ctx({"custom_1": 9.0}, {"custom_1"}))
    assert (v.ok, v.code, v.fields) == (False, "conflict", ("scale:custom_1",))
    v = evaluate_undo(_obs(), "observation", ev, _ctx({"custom_1": 7.0}, set()))
    assert (v.ok, v.code, v.fields) == (False, "scale_missing", ("scale:custom_1",))


def test_unit_scale_event_without_context_is_blocked_not_applied_blindly():
    v = evaluate_undo(_obs(), "observation", _scale_ev("custom_1", 5.0, 7.0))
    assert (v.ok, v.code) == (False, "scale_missing")


def test_unit_builtin_scale_id_needs_no_custom_def_and_none_means_absent():
    assert evaluate_undo(_obs(), "observation", _scale_ev("importance", None, 7.0), _ctx({"importance": 7.0})).ok
    assert evaluate_undo(_obs(), "observation", _scale_ev("importance", 7.0, None), _ctx({})).ok


def test_unit_scale_key_is_not_confused_with_same_named_column():
    # колонка importance = 0, значение шкалы "importance" = 7: событие про шкалу, а не про колонку
    obj = _obs(importance=0)
    assert evaluate_undo(obj, "observation", _scale_ev("importance", None, 7.0), _ctx({"importance": 7.0})).ok


def test_unit_forbidden_column_dominates_mixed_event():
    ev = _ev({"status": {"old": "x", "new": "y"}, "scale:custom_1": {"old": 1.0, "new": 2.0}})
    v = evaluate_undo(_obs(), "observation", ev, _ctx({"custom_1": 2.0}, {"custom_1"}))
    assert (v.code, v.fields) == ("field_not_undoable", ("status",))


def test_unit_apply_undo_skips_scale_keys_and_reports_them():
    ev = _ev({"title": {"old": "A", "new": "B"}, "scale:custom_1": {"old": 5.0, "new": 7.0}})
    obj = _obs(title="B")
    assert apply_undo(obj, ev) == ["scale:custom_1", "title"]
    assert obj.title == "A"
    assert scale_undo_values(ev) == {"custom_1": 5.0}
