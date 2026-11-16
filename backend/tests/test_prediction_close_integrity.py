"""Целостность закрытия прогноза: закрыть можно один раз, только через /close, а исход
закрытого прогноза финален (см. api/v1/predictions.py: close_pred / update_pred). Калибровка
теперь считается на лету из сырых прогнозов (calibration_source.py, 29.09), а не копится в
таблице — но правило «один прогноз даёт вклад ровно один раз» по-прежнему обеспечивают именно
эти же ограничения close/PUT, а не отдельная защита в формуле счёта."""
import asyncio

import pytest
from app.db.session import AsyncSessionLocal
from app.services.calibration_source import rows_for_personal
from tests.conftest import create_test_user
from tests.test_undo import _PRED, _login, _new_pred, _put_pred


async def _personal_n_closed(user_id: int) -> int:
    """Раньше читало копилку CalibrationStat (сумму по ВСЕМ пользователям сразу — de facto
    работало только потому что в каждом тесте был единственный пользователь). Копилки больше
    нет (calibration_source.py, 29.09): считаем на лету по конкретному user_id, как это теперь
    делает и сам продакшен-код (get_calibration_multiplier)."""
    async with AsyncSessionLocal() as s:
        return len(await rows_for_personal(s, user_id))


def _close(client, pid, status="подтвердился"):
    return client.put(f"/api/v1/predictions/{pid}/close", json={"status": status, "result_notes": ""})


async def _status(client, pid):
    return (await client.get(f"/api/v1/predictions/{pid}")).json()["status"]


@pytest.mark.asyncio
async def test_second_close_is_409_and_counted_once(client):
    user = await create_test_user("cls_u1")
    await _login(client, "cls_u1")
    pred = await _new_pred(client)
    assert (await _close(client, pred["id"])).status_code == 200
    assert (await _close(client, pred["id"], "не подтвердился")).status_code == 409
    assert await _status(client, pred["id"]) == "подтвердился"
    assert await _personal_n_closed(user.id) == 1


@pytest.mark.asyncio
async def test_parallel_close_counted_once(client):
    user = await create_test_user("cls_u2")
    await _login(client, "cls_u2")
    pred = await _new_pred(client)
    r1, r2 = await asyncio.gather(_close(client, pred["id"]), _close(client, pred["id"]))
    assert sorted([r1.status_code, r2.status_code]) == [200, 409]
    assert await _personal_n_closed(user.id) == 1


@pytest.mark.asyncio
async def test_close_requires_closing_status(client):
    user = await create_test_user("cls_u3")
    await _login(client, "cls_u3")
    pred = await _new_pred(client)
    assert (await _close(client, pred["id"], "не проверен")).status_code == 400
    assert await _status(client, pred["id"]) == "не проверен"
    assert await _personal_n_closed(user.id) == 0


@pytest.mark.asyncio
async def test_put_cannot_close_reopen_or_change_outcome(client):
    user = await create_test_user("cls_u4")
    await _login(client, "cls_u4")
    pred = await _new_pred(client)

    assert (await _put_pred(client, pred["id"], status="подтвердился")).status_code == 400
    assert await _status(client, pred["id"]) == "не проверен"
    assert await _personal_n_closed(user.id) == 0

    assert (await _close(client, pred["id"])).status_code == 200
    for target in ("не проверен", "не подтвердился"):
        assert (await _put_pred(client, pred["id"], status=target)).status_code == 400
        assert await _status(client, pred["id"]) == "подтвердился"
    assert await _personal_n_closed(user.id) == 1


@pytest.mark.asyncio
async def test_create_cannot_start_closed(client):
    user = await create_test_user("cls_u5")
    await _login(client, "cls_u5")
    r = await client.post("/api/v1/predictions/", json={**_PRED, "status": "подтвердился"})
    assert r.status_code == 400
    assert await _personal_n_closed(user.id) == 0
    # обычное создание открытого прогноза не затронуто
    assert (await client.post("/api/v1/predictions/", json=_PRED)).status_code in (200, 201)
