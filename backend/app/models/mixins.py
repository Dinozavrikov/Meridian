"""Soft-delete для 6 базовых сущностей (ENTITY_MODELS).

deleted_at IS NULL — запись жива. NOT NULL — запись в корзине владельца:
хранится бессрочно, автоматической зачистки для этих типов нет и не будет
(осознанное решение, в отличие от EntityAttachment с retention 180 дней).
Единственный путь физического удаления — явный DELETE .../permanent владельцем.

Маркер is_soft_deletable() — единственный способ узнать, что у модели есть
deleted_at: Result и прочие модели его не имеют, generic-код (например
entity_visibility_filter) обязан спрашивать, а не обращаться к атрибуту."""
from datetime import datetime

from sqlalchemy import DateTime, Index, text
from sqlalchemy.orm import Mapped, mapped_column


class SoftDeleteMixin:
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


def soft_delete_index(table: str) -> Index:
    """Partial index: индексируются только записи в корзине — не раздувает
    индекс для подавляющего большинства живых строк и ускоряет GET /trash."""
    return Index(f"idx_{table}_deleted_at", "deleted_at", postgresql_where=text("deleted_at IS NOT NULL"))


def is_soft_deletable(model) -> bool:
    return isinstance(model, type) and issubclass(model, SoftDeleteMixin)
