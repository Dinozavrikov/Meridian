"""add embedding_model to entity_embeddings

Revision ID: d5f1c2a7e930
Revises: c4e8a1b93f27
Create Date: 2026-09-21 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd5f1c2a7e930'
down_revision: Union[str, None] = 'c4e8a1b93f27'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("entity_embeddings", sa.Column("embedding_model", sa.String(length=64), nullable=True))
    # Все существующие векторы (прод и dev) пересчитаны 20.09 моделью qwen3-embedding:0.6b
    # (scripts/reembed_embeddings.py: 38/38 и 1/1, failed=0) — помечаем ею. Если БД восстановлена из более
    # старой копии, метка будет неверной: выполните scripts/reembed_embeddings.py --all.
    op.execute("UPDATE entity_embeddings SET embedding_model = 'qwen3-embedding:0.6b'")
    op.alter_column("entity_embeddings", "embedding_model", existing_type=sa.String(length=64), nullable=False)


def downgrade() -> None:
    op.drop_column("entity_embeddings", "embedding_model")
