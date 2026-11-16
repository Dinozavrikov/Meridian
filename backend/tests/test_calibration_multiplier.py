"""Множитель вклада в сигнал: честная мера (умение лучше «ленивого»), а не близость к исходу."""
from datetime import datetime, timezone

import pytest
from sqlalchemy import select

from tests.conftest import create_test_user
from app.db.session import AsyncSessionLocal
from app.models.entities import Prediction
from app.models.user import User
from app.services.calibration_source import skill_multiplier
from app.services.hypothesis_evidence import get_calibration_multiplier


async def _seed(username, rows):
    await create_test_user(username)
    async with AsyncSessionLocal() as db:
        uid = (await db.execute(select(User.id).where(User.username == username))).scalar_one()
        for i, (conf, status) in enumerate(rows):
            db.add(Prediction(user_id=uid, title="п", slug=f"{username}-{i}", text="т", date_created="2026-08-06",
                              expected_check_date=datetime(2026, 12, 6, tzinfo=timezone.utc),
                              status=status, confidence=conf, visibility="private"))
        await db.commit()
    return uid


def test_unit_edges():
    assert skill_multiplier([]) == 1.0
    one = skill_multiplier([(90, "подтвердился")])
    assert 0.5 <= one <= 1.0 and one > 0.9            # мало данных: почти нейтрально


@pytest.mark.asyncio
async def test_sun_will_rise_pumping_does_not_raise_multiplier(client):
    pump = await _seed("cm_pump", [(99, "подтвердился")] * 30)
    honest = await _seed("cm_honest", [(90, "подтвердился")] * 15 + [(10, "не подтвердился")] * 15)
    async with AsyncSessionLocal() as db:
        m_pump = await get_calibration_multiplier(db, "personal", str(pump))
        m_honest = await get_calibration_multiplier(db, "personal", str(honest))
    assert m_pump == pytest.approx(1.0)   # нет разброса исходов: меру не измерить, множитель как у новичка
    assert m_honest > 0.9         # настоящее умение различать даёт почти полный вклад
    assert m_honest > 0.95        # почти полный вклад; выше 1.0 множитель не бывает, накачка бонуса не получает


@pytest.mark.asyncio
async def test_pumping_does_not_hide_misses(client):
    # одни и те же 5 промахов при 90%: с серией «солнце взойдёт» и без неё множитель почти одинаков
    pumped = await _seed("cm_pbad", [(99, "подтвердился")] * 30 + [(90, "не подтвердился")] * 5)
    plain = await _seed("cm_plain", [(90, "подтвердился")] * 5 + [(90, "не подтвердился")] * 5)
    async with AsyncSessionLocal() as db:
        m_pumped = await get_calibration_multiplier(db, "personal", str(pumped))
        m_plain = await get_calibration_multiplier(db, "personal", str(plain))
    assert m_pumped < 0.9                       # промахи видны, множитель не нейтральный
    assert abs(m_pumped - m_plain) < 0.05       # серия не разбавила историю
