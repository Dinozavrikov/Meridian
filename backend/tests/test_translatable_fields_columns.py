"""Каждое непроизводное поле из белого списка перевода существует в модели: иначе сервер молча не переведёт его."""
from app.core.entity_registry import ENTITY_MODELS
from app.core.translatable_fields import TRANSLATABLE_FIELDS
from app.core.translatable_resolvers import BASE_DERIVED, FIELD_ATTR, RESULT_DERIVED
from app.models.entities import Result, SourceDocument
from app.models.social import EntityComment, Lab, LabJoinRequest, Message
from app.models.user import User


def test_every_translatable_field_is_a_model_attribute():
    models = {**ENTITY_MODELS, "result": Result, "lab": Lab, "comment": EntityComment, "source_document": SourceDocument,
              "message": Message, "lab_join_request": LabJoinRequest, "user": User}
    assert set(models) == set(TRANSLATABLE_FIELDS), "тип в белом списке без модели (или наоборот)"
    missing = []
    for etype, fields in TRANSLATABLE_FIELDS.items():
        derived = BASE_DERIVED if etype in ENTITY_MODELS else RESULT_DERIVED if etype == "result" else frozenset()
        for f in fields - derived:
            if not hasattr(models[etype], FIELD_ATTR.get((etype, f), f)):
                missing.append(f"{etype}.{f}")
    assert missing == []
