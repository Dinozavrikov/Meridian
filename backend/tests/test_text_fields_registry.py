"""Реестр текстовых полей: каждая Text-колонка модели явно либо rich (HTML из редактора, в нём бывают
ссылки meridian://), либо plain. Новая Text-колонка без классификации роняет тест: упоминания (entity_mentions)
не должны молча пропускать новое rich-поле."""
from sqlalchemy import Text

import app.models.entities, app.models.i18n, app.models.social, app.models.user  # noqa: F401  (все модели в metadata)
from app.db.base import Base
from app.core.text_fields import PLAIN_TEXT_FIELDS, RICH_TEXT_FIELDS


def _text_columns() -> set[tuple[str, str]]:
    out = set()
    for m in Base.registry.mappers:
        for col in m.local_table.columns:
            if isinstance(col.type, Text):
                out.add((m.class_.__name__, col.key))
    return out


def _flat(reg: dict[str, frozenset[str]]) -> set[tuple[str, str]]:
    return {(c, f) for c, fs in reg.items() for f in fs}


def test_every_text_column_is_classified():
    missing = _text_columns() - _flat(RICH_TEXT_FIELDS) - _flat(PLAIN_TEXT_FIELDS)
    assert not missing, f"Text-колонки без классификации rich/plain (core/text_fields.py): {sorted(missing)}"


def test_registry_has_no_stale_or_double_entries():
    cols = _text_columns()
    stale = (_flat(RICH_TEXT_FIELDS) | _flat(PLAIN_TEXT_FIELDS)) - cols
    assert not stale, f"в реестре есть поля, которых нет в моделях: {sorted(stale)}"
    both = _flat(RICH_TEXT_FIELDS) & _flat(PLAIN_TEXT_FIELDS)
    assert not both, f"поле и rich, и plain: {sorted(both)}"
