"""entity_mentions: упоминания записей в rich-тексте

Revision ID: i3d6f0a2c485
Revises: h2c5e9f1b374
"""
from alembic import op
import sqlalchemy as sa

revision = "i3d6f0a2c485"
down_revision = "h2c5e9f1b374"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "entity_mentions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("source_type", sa.String(32), nullable=False),
        sa.Column("source_id", sa.Integer(), nullable=False),
        sa.Column("field", sa.String(32), nullable=False),
        sa.Column("target_type", sa.String(32), nullable=False),
        sa.Column("target_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("source_type", "source_id", "field", "target_type", "target_id", name="uq_entity_mentions"),
    )
    op.create_index("ix_entity_mentions_source", "entity_mentions", ["source_type", "source_id"])
    op.create_index("ix_entity_mentions_target", "entity_mentions", ["target_type", "target_id"])


def downgrade() -> None:
    op.drop_index("ix_entity_mentions_target", table_name="entity_mentions")
    op.drop_index("ix_entity_mentions_source", table_name="entity_mentions")
    op.drop_table("entity_mentions")
