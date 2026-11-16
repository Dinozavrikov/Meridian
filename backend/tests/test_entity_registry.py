"""Регресс: реестр entity_type -> модель один на весь бэкенд.
Раньше comments.py держал локальную копию ENTITY_OWNER_MODELS, молча
перекрытую импортом ниже по файлу — лишний источник правды."""
from app.core.entity_registry import ENTITY_MODELS


def test_all_consumers_share_the_registry_object():
    from app.api.v1 import comments
    from app.services import repost, entity_access
    assert comments.ENTITY_OWNER_MODELS is ENTITY_MODELS
    assert entity_access.ENTITY_OWNER_MODELS is ENTITY_MODELS
    assert repost.ENTITY_MODELS is ENTITY_MODELS


def test_registry_has_exactly_six_base_types():
    # По ENTITY_MODELS итерируются граф, лента и unread-рассылка —
    # вложения и прочие не-базовые типы сюда добавлять нельзя.
    assert set(ENTITY_MODELS) == {
        "observation", "hypothesis", "prediction",
        "worldview", "question", "task",
    }


def test_event_logged_registry_extends_base_with_attachment_only():
    from app.core.entity_registry import EVENT_LOGGED_MODELS
    from app.models.entities import EntityAttachment
    assert set(EVENT_LOGGED_MODELS) == set(ENTITY_MODELS) | {"attachment"}
    assert EVENT_LOGGED_MODELS["attachment"] is EntityAttachment
    assert "attachment" not in ENTITY_MODELS
