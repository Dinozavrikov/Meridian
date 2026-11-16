"""Предупреждение «копия останется в снимках» (фронтенд: NotesTimeline inLab) строится по полю lab_id у записи.
Если API перестанет отдавать lab_id, предупреждение молча пропадёт — тест держит это для всех 6 типов."""
import pytest

from app.db.session import AsyncSessionLocal
from tests.test_lab_checkpoints import _six, _world
from tests.test_undo import _login

PATHS = {"observation": "observations", "hypothesis": "hypotheses", "prediction": "predictions",
         "worldview": "worldview", "question": "questions", "task": "tasks"}


async def _setup(client):
    w = await _world("owner")
    async with AsyncSessionLocal() as db:
        six = await _six(db, w.uid["owner"], w.lab_id)
        ids = {k: v.id for k, v in six.items()}
        await db.commit()
    await _login(client, "owner")
    return w, ids


@pytest.mark.asyncio
@pytest.mark.parametrize("etype", list(PATHS))
async def test_detail_response_carries_lab_id(client, etype):
    w, ids = await _setup(client)
    r = await client.get(f"/api/v1/{PATHS[etype]}/{ids[etype]}")
    assert r.status_code == 200, r.text
    assert r.json().get("lab_id") == w.lab_id


@pytest.mark.asyncio
@pytest.mark.parametrize("etype", list(PATHS))
async def test_list_response_carries_lab_id(client, etype):
    w, ids = await _setup(client)
    r = await client.get(f"/api/v1/{PATHS[etype]}", follow_redirects=True)
    assert r.status_code == 200, r.text
    data = r.json()
    rows = data if isinstance(data, list) else data.get("items", [])
    row = next((x for x in rows if x.get("id") == ids[etype]), None)
    assert row is not None, "запись лаборатории не вернулась в списке"
    assert row.get("lab_id") == w.lab_id
