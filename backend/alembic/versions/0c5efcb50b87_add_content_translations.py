"""add content_translations table

Revision ID: 0c5efcb50b87
Revises: 92c310cb9aeb
Create Date: 2026-09-12 01:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '0c5efcb50b87'
down_revision: Union[str, None] = '92c310cb9aeb'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Кэш переводов пользовательского контента — ключ (entity_type, entity_id,
    # field, target_lang), НЕ сам текст (см. useDynamicT.ts докстринг: для
    # контента ключевание по тексту не годится — он уникален на запись,
    # кэш по значению не даёт переиспользования и просто раздувается).
    # source_hash — та же схема инвалидации, что и у ui_string_translations.
    op.create_table(
        "content_translations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("entity_type", sa.String(length=32), nullable=False, index=True),
        sa.Column("entity_id", sa.Integer(), nullable=False, index=True),
        sa.Column("field", sa.String(length=32), nullable=False),
        sa.Column("source_hash", sa.String(length=64), nullable=False),
        sa.Column("target_lang", sa.String(length=16), nullable=False, index=True),
        sa.Column("translated_text", sa.Text(), nullable=False),
        sa.Column("generated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("entity_type", "entity_id", "field", "target_lang", name="uq_content_translation"),
    )


def downgrade() -> None:
    op.drop_table("content_translations")
