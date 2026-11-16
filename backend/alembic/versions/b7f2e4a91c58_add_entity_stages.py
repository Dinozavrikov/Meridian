"""add entity_stages table

Revision ID: b7f2e4a91c58
Revises: d5f1c2a7e930
Create Date: 2026-09-23 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b7f2e4a91c58'
down_revision: Union[str, None] = 'd5f1c2a7e930'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Опциональная привязка сущности (или лабы) к одной из 8 фиксированных
    # платформенных стадий — см. докстринг app.models.entities.EntityStage.
    # Отсутствие строки для entity_type/entity_id = "стадия не отслеживается",
    # не ошибка — таблица создаётся пустой, никакого backfill не требуется.
    op.create_table(
        "entity_stages",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("entity_type", sa.String(length=32), nullable=False),
        sa.Column("entity_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("current_stage", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_entity_stages_user_id", "entity_stages", ["user_id"])
    op.create_unique_constraint(
        "entity_stages_entity_unique", "entity_stages", ["entity_type", "entity_id"]
    )


def downgrade() -> None:
    op.drop_constraint("entity_stages_entity_unique", "entity_stages", type_="unique")
    op.drop_index("ix_entity_stages_user_id", table_name="entity_stages")
    op.drop_table("entity_stages")
