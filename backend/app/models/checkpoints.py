"""Снимки лабы (см. services/lab_checkpoints.py): полная копия содержимого на момент времени."""
from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Index, Integer, String, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class LabCheckpoint(Base):
    """created_at — timestamptz, задаётся кодом: время входит в commit_hash, а TimestampMixin
    проекта хранит время без часового пояса. Снимки не удаляются поштучно — только вместе с лабой."""
    __tablename__ = "lab_checkpoints"
    id:             Mapped[int]        = mapped_column(primary_key=True)
    lab_id:         Mapped[int]        = mapped_column(ForeignKey("labs.id", ondelete="CASCADE"), index=True)
    created_by:     Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    # Предыдущий снимок ЭТОЙ лабы; у форка — снимок исходной лабы (родитель между лабами допустим).
    parent_id:      Mapped[int | None] = mapped_column(ForeignKey("lab_checkpoints.id", ondelete="SET NULL"), nullable=True)
    # Хеш родителя на момент создания (входит в commit_hash). Отдельно от parent_id: тот при удалении родителя
    # (у форка он в другой лабе) становится NULL, а хеш снимка от этого меняться не должен.
    parent_commit_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    title:          Mapped[str | None] = mapped_column(String(120), nullable=True)
    is_published:   Mapped[bool]       = mapped_column(Boolean, default=False, server_default=text("false"))
    published_at:   Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    published_by:   Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    schema_version: Mapped[int]        = mapped_column(Integer)
    tree_hash:      Mapped[str]        = mapped_column(String(64))
    commit_hash:    Mapped[str]        = mapped_column(String(64), index=True)
    item_count:     Mapped[int]        = mapped_column(Integer)
    blob_bytes:     Mapped[int]        = mapped_column(BigInteger, default=0)
    created_at:     Mapped[datetime]   = mapped_column(DateTime(timezone=True))

    # Цепочка линейна В ПРЕДЕЛАХ лабы: у снимка не больше одного потомка, корень один.
    __table_args__ = (
        Index("uq_lab_checkpoints_root", "lab_id", unique=True, postgresql_where=text("parent_id IS NULL")),
        Index("uq_lab_checkpoints_child", "lab_id", "parent_id", unique=True, postgresql_where=text("parent_id IS NOT NULL")),
    )


class LabCheckpointItem(Base):
    """Одна копируемая строка (запись, ребёнок, связь...) + хеш. entity_type/entity_id — запись,
    к которой элемент относится (для детей — родитель). object_key уникален в снимке и служит
    ключом сопоставления при диффе и merge."""
    __tablename__ = "lab_checkpoint_items"
    id:            Mapped[int]        = mapped_column(primary_key=True)
    checkpoint_id: Mapped[int]        = mapped_column(ForeignKey("lab_checkpoints.id", ondelete="CASCADE"))
    kind:          Mapped[str]        = mapped_column(String(32))
    entity_type:   Mapped[str]        = mapped_column(String(32))
    entity_id:     Mapped[int | None] = mapped_column(Integer, nullable=True)
    object_key:    Mapped[str]        = mapped_column(String(160))
    snapshot_data: Mapped[dict]       = mapped_column(JSONB)
    item_hash:     Mapped[str]        = mapped_column(String(64))
    blob_sha256:   Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    blob_size:     Mapped[int | None] = mapped_column(BigInteger, nullable=True)

    __table_args__ = (
        UniqueConstraint("checkpoint_id", "object_key", name="uq_lab_checkpoint_items_key"),
        Index("ix_lab_checkpoint_items_kind", "checkpoint_id", "kind"),
        Index("ix_lab_checkpoint_items_entity", "checkpoint_id", "entity_type", "entity_id"),
    )
