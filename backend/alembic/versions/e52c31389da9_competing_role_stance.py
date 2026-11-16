"""Роль и отношение конкурирующей гипотезы (entity_hypotheses.role / stance)

Revision ID: e52c31389da9
Revises: 9b26391fbbe4
"""
from alembic import op
import sqlalchemy as sa

revision = "e52c31389da9"
down_revision = "9b26391fbbe4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("entity_hypotheses", sa.Column("role", sa.String(16), nullable=False, server_default="alternative"))
    op.add_column("entity_hypotheses", sa.Column("stance", sa.String(64), nullable=False, server_default="связано"))


def downgrade() -> None:
    op.drop_column("entity_hypotheses", "stance")
    op.drop_column("entity_hypotheses", "role")
