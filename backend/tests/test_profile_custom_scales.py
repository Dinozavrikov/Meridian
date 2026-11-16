"""Воспроизведение подозрения: профильная статистика у пользователя с собственной шкалой
(users.py: ScaleValue.hypothesis_id / scale_id == sd.id при строковом scale_id 'custom_<id>').
МОЖЕТ УПАСТЬ — трейсбек покажет, какой именно атрибут не существует."""
import pytest

from app.db.session import AsyncSessionLocal
from app.models.entities import ScaleDef
from tests.conftest import create_test_user
from tests.test_calibration_residue import _route
from tests.test_soft_delete_api import _login


@pytest.mark.asyncio
async def test_profile_stats_works_for_user_with_custom_scale(client):
    u = await create_test_user("scl_prof")
    async with AsyncSessionLocal() as db:
        db.add(ScaleDef(user_id=u.id, entity_type="hypothesis", name="Своя шкала", levels="[]"))
        await db.commit()
    await _login(client, u.username)
    r = await client.get(_route("get_profile_stats", "users").replace("{username}", u.username))
    assert r.status_code == 200, r.text
