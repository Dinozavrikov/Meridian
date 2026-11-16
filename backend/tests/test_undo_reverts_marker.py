"""Пометка reverts_event_id у событий, порождённых откатом (UI различает откат и обычную правку),
и отказ set_scale_value для удалённой записи. Интеграционные тесты идут через настоящий HTTP."""
import pytest
from sqlalchemy import select

from app.db.session import AsyncSessionLocal
from app.models.entities import Observation, ScaleValue
from app.models.user import User
from app.services.scale_values import set_scale_value
from tests.conftest import create_test_user
from tests.test_undo import _edit_obs, _history, _login, _new_obs, _title, _undo, _with_field
from tests.test_undo_scales import _new_scale, _put_scale


@pytest.mark.asyncio
async def test_undo_events_are_marked_and_redo_chain_is_traceable(client):
    await create_test_user("undo_m1")
    await _login(client, "undo_m1")
    obs = await _new_obs(client, title="A")
    await _edit_obs(client, obs["id"], title="B")
    e = _with_field(await _history(client, "observation", obs["id"]), "title")[0]
    assert e["reverts_event_id"] is None                       # обычная правка не помечена

    assert (await _undo(client, "observation", obs["id"], e["id"])).status_code == 200
    u1 = _with_field(await _history(client, "observation", obs["id"]), "title")[0]
    assert u1["id"] != e["id"] and u1["reverts_event_id"] == e["id"]
    assert u1["changed_fields"]["title"] == {"old": "B", "new": "A"}

    # «вперёд» = откат отката: новое событие помечено как откат u1
    assert (await _undo(client, "observation", obs["id"], u1["id"])).status_code == 200
    hist = await _history(client, "observation", obs["id"])
    u2 = _with_field(hist, "title")[0]
    assert u2["reverts_event_id"] == u1["id"]
    assert await _title(client, obs["id"]) == "B"
    by_id = {h["id"]: h for h in hist}
    assert by_id[e["id"]]["reverts_event_id"] is None and by_id[e["id"]]["undoable"] is True

    await _edit_obs(client, obs["id"], title="C")             # обычная правка после откатов не помечается
    assert _with_field(await _history(client, "observation", obs["id"]), "title")[0]["reverts_event_id"] is None


@pytest.mark.asyncio
async def test_scale_undo_event_is_marked(client):
    await create_test_user("undo_m2")
    await _login(client, "undo_m2")
    obs = await _new_obs(client)
    key = f"custom_{await _new_scale('undo_m2')}"
    fk = f"scale:{key}"
    assert (await _put_scale(client, "observation", obs["id"], key, 7)).status_code == 200
    e = _with_field(await _history(client, "observation", obs["id"]), fk)[0]
    assert e["reverts_event_id"] is None

    assert (await _undo(client, "observation", obs["id"], e["id"])).status_code == 200
    u = _with_field(await _history(client, "observation", obs["id"]), fk)[0]
    assert u["id"] != e["id"] and u["reverts_event_id"] == e["id"]

    assert (await _put_scale(client, "observation", obs["id"], key, 3)).status_code == 200
    assert _with_field(await _history(client, "observation", obs["id"]), fk)[0]["reverts_event_id"] is None


@pytest.mark.asyncio
async def test_set_scale_value_refuses_soft_deleted_entity(client):
    await create_test_user("undo_m3")
    await _login(client, "undo_m3")
    obs = await _new_obs(client)
    assert (await client.delete(f"/api/v1/observations/{obs['id']}")).status_code == 204

    async with AsyncSessionLocal() as db:
        uid = (await db.execute(select(User.id).where(User.username == "undo_m3"))).scalar_one()
        row = await db.get(Observation, obs["id"])
        assert row is not None and row.deleted_at is not None
        with pytest.raises(LookupError):
            await set_scale_value(db, user_id=uid, obj=row, entity_type="observation",
                                  scale_id="importance", value=3)
        await db.rollback()

    async with AsyncSessionLocal() as db:
        stored = (await db.execute(select(ScaleValue).where(
            ScaleValue.entity_type == "observation", ScaleValue.entity_id == obs["id"],
            ScaleValue.scale_id == "importance"))).first()
        assert stored is None
