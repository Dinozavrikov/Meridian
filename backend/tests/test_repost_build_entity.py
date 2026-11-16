"""Прямое покрытие всех 6 веток app.services.repost.build_entity —
раньше только ветка "observation" случайно проверялась через
test_e2e_lab_scenario.py::test_full_lab_lifecycle_scenario (repost-шаг),
остальные пять типов не были покрыты вообще. Найдено 19.09: консолидация
ENTITY_MODELS (app/core/entity_registry.py) убрала прямые импорты моделей
из repost.py, а build_entity использует Observation/Hypothesis/Prediction/
Worldview/Question/ResearchTask по имени напрямую в конструкторах — ловится
только реальным вызовом каждой ветки, не импортом модуля."""
import pytest
from datetime import datetime, timezone
from app.db.session import AsyncSessionLocal
from app.services.repost import build_entity
from tests.conftest import create_test_user


@pytest.mark.asyncio
@pytest.mark.parametrize("target_type,extra_kwargs", [
    ("observation", {}),
    ("hypothesis", {}),
    ("prediction", {"expected_check_date": datetime(2027, 1, 1, tzinfo=timezone.utc)}),
    ("worldview", {}),
    ("question", {}),
    ("task", {}),
])
async def test_build_entity_all_six_branches(target_type, extra_kwargs):
    user = await create_test_user(f"repost_{target_type}_user")
    async with AsyncSessionLocal() as db:
        entity = await build_entity(
            db, target_type,
            title=f"Repost {target_type} title",
            text=f"Repost {target_type} body",
            user_id=user.id,
            visibility="private",
            lab_id=None,
            **extra_kwargs,
        )
        db.add(entity)
        await db.commit()
        await db.refresh(entity)
        assert entity.id is not None
        assert entity.user_id == user.id
        assert entity.slug, f"{target_type}: slug должен быть заполнен (см. докстринг build_entity про исторический баг с пустым slug)"
