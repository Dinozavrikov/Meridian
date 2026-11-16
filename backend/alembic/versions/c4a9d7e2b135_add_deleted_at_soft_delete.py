"""soft-delete: deleted_at + partial index для 6 базовых сущностей

Revision ID: c4a9d7e2b135
Revises: b7f2e4a91c58
Create Date: 2026-09-24 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c4a9d7e2b135'
down_revision: Union[str, None] = 'b7f2e4a91c58'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TABLES = ("observations", "hypotheses", "predictions", "worldview", "questions", "research_tasks")


def upgrade() -> None:
    # NULL = запись жива, backfill не нужен. Partial index — только по записям
    # в корзине (см. app.models.mixins.soft_delete_index).
    for t in _TABLES:
        op.add_column(t, sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))
        op.create_index(
            f"idx_{t}_deleted_at", t, ["deleted_at"],
            postgresql_where=sa.text("deleted_at IS NOT NULL"),
        )


def downgrade() -> None:
    # Внимание: откат стирает колонку вместе с содержимым корзины — записи,
    # которые в ней лежали, после отката снова станут «живыми».
    for t in reversed(_TABLES):
        op.drop_index(f"idx_{t}_deleted_at", table_name=t)
        op.drop_column(t, "deleted_at")
