"""add entity_attachment_versions table

Хранит предыдущее содержимое EntityAttachment при замене (PUT .../file или
.../text) — см. докстринг app.models.entities.EntityAttachmentVersion.
Не полиморфная модель, обычный FK на entity_attachments.id — cascade делает
БД (ON DELETE CASCADE), эта таблица НЕ в POLYMORPHIC_CHILD_MODELS.

Revision ID: 77ca70f190c0
Revises: f4d8b6c2a913
Create Date: 2026-09-26 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '77ca70f190c0'
down_revision: Union[str, None] = 'f4d8b6c2a913'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_T = "entity_attachment_versions"


def upgrade() -> None:
    op.create_table(
        _T,
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("attachment_id", sa.Integer(), sa.ForeignKey("entity_attachments.id", ondelete="CASCADE"), nullable=False),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("storage_path", sa.String(length=255), nullable=False),
        sa.Column("text_content", sa.Text(), nullable=True),
        sa.Column("mime_type", sa.String(length=128), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("language", sa.String(length=32), nullable=True),
        sa.Column("superseded_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(f"ix_{_T}_attachment", _T, ["attachment_id", "superseded_at"])


def downgrade() -> None:
    op.drop_index(f"ix_{_T}_attachment", table_name=_T)
    op.drop_table(_T)
