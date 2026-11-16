"""add entity_attachments table

Revision ID: c4e8a1b93f27
Revises: a1b2c3d4e5f6
Create Date: 2026-09-20 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c4e8a1b93f27'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Файловые вложения (код/документы/прочее) — см. докстринг
    # app.models.entities.EntityAttachment. created_at/updated_at — как у
    # TimestampMixin (naive DateTime), deleted_at — с timezone.
    op.create_table(
        "entity_attachments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("entity_type", sa.String(length=32), nullable=False),
        sa.Column("entity_id", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("storage_path", sa.String(length=255), nullable=False),
        sa.Column("mime_type", sa.String(length=128), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("language", sa.String(length=32), nullable=True),
        sa.Column("text_content", sa.Text(), nullable=True),
        sa.Column("thumb_filename", sa.String(length=255), nullable=True),
        sa.Column("width", sa.Integer(), nullable=True),
        sa.Column("height", sa.Integer(), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_entity_attachments_user_id", "entity_attachments", ["user_id"])
    op.create_index("ix_entity_attachments_entity", "entity_attachments", ["entity_type", "entity_id"])


def downgrade() -> None:
    op.drop_index("ix_entity_attachments_entity", table_name="entity_attachments")
    op.drop_index("ix_entity_attachments_user_id", table_name="entity_attachments")
    op.drop_table("entity_attachments")
