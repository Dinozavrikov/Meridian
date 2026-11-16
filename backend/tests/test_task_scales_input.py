"""Шкалы задач: вход проверяется (тип, длина), служебные поля не перезаписываются, чужую приватную гипотезу
привязать нельзя."""
import pytest
from sqlalchemy import select

from tests.conftest import create_test_user
from tests.test_lab_signal import _login
from tests.test_calibration_residue import _mk
from app.db.session import AsyncSessionLocal
from app.models.entities import TaskScale

OK = {"name": "Ш", "min_val": 0, "max_val": 10, "hypothesis_ids": []}


async def _scale(client, tid):
    r = await client.post(f"/api/v1/tasks/{tid}/scales", json=OK)
    assert r.status_code == 201, r.text
    return r.json()["id"]


@pytest.mark.asyncio
async def test_put_cannot_move_scale_to_foreign_task(client):
    u = await create_test_user("ts_a"); other = await create_test_user("ts_b")
    t1 = await _mk("task", u.id, "ts-t1"); t2 = await _mk("task", other.id, "ts-t2")
    await _login(client, u.username)
    sid = await _scale(client, t1)
    await client.put(f"/api/v1/tasks/{t1}/scales/{sid}", json={"name": "Новое", "task_id": t2})
    async with AsyncSessionLocal() as db:
        s = (await db.execute(select(TaskScale).where(TaskScale.id == sid))).scalar_one()
        assert s.task_id == t1            # сегодня шкала переезжает в чужую задачу


@pytest.mark.asyncio
@pytest.mark.parametrize("body", [{"min_val": "abc"}, {"max_val": None}, {"name": "я" * 500}, {"unit": "я" * 100}])
async def test_create_scale_bad_input_is_422(client, body):
    u = await create_test_user("ts_c"); await _login(client, u.username)
    t = await _mk("task", u.id, "ts-t3")
    r = await client.post(f"/api/v1/tasks/{t}/scales", json={**OK, **body})
    assert r.status_code == 422, (body, r.status_code)     # сегодня 500


@pytest.mark.asyncio
@pytest.mark.parametrize("value", ["abc", None, [1]])
async def test_set_value_bad_input_is_422(client, value):
    u = await create_test_user("ts_d"); await _login(client, u.username)
    t = await _mk("task", u.id, "ts-t4")
    sid = await _scale(client, t)
    r = await client.patch(f"/api/v1/tasks/{t}/scales/{sid}/value", json={"value": value})
    assert r.status_code == 422, (value, r.status_code)    # сегодня 500


@pytest.mark.asyncio
async def test_cannot_link_scale_to_foreign_private_hypothesis(client):
    u = await create_test_user("ts_e"); other = await create_test_user("ts_f")
    t = await _mk("task", u.id, "ts-t5")
    h = await _mk("hypothesis", other.id, "ts-h5", visibility="private")
    await _login(client, u.username)
    r = await client.post(f"/api/v1/tasks/{t}/scales", json={**OK, "hypothesis_ids": [h]})
    assert r.status_code in (403, 404, 422), r.text        # сегодня 201


@pytest.mark.asyncio
async def test_valid_create_update_value_still_work(client):
    """ОХРАННЫЙ (зелёный и до патча)."""
    u = await create_test_user("ts_g"); await _login(client, u.username)
    t = await _mk("task", u.id, "ts-t6")
    sid = await _scale(client, t)
    r = await client.put(f"/api/v1/tasks/{t}/scales/{sid}", json={"name": "Н", "min_val": 0, "max_val": 5,
                         "value_labels": {"1": "мало"}, "hypothesis_ids": []})
    assert r.status_code == 200, r.text
    r = await client.patch(f"/api/v1/tasks/{t}/scales/{sid}/value", json={"value": 3})
    assert r.status_code == 200 and r.json()["current_val"] == 3
