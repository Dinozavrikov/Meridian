"""record_shares: согласие владельца на открытие записи лаборатории через связь

Revision ID: h2c5e9f1b374
Revises: g1b4d8e2a763
"""
from alembic import op
import sqlalchemy as sa

revision = "h2c5e9f1b374"
down_revision = "g1b4d8e2a763"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "record_shares",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("entity_type", sa.String(32), nullable=False),
        sa.Column("entity_id", sa.Integer(), nullable=False),
        sa.Column("lab_id", sa.Integer(), sa.ForeignKey("labs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("via_type", sa.String(32), nullable=False),
        sa.Column("via_id", sa.Integer(), nullable=False),
        sa.Column("granted_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("entity_type", "entity_id", "lab_id", "via_type", "via_id", name="uq_record_shares"),
    )
    op.create_index("ix_record_shares_entity", "record_shares", ["entity_type", "entity_id"])
    op.create_index("ix_record_shares_lab", "record_shares", ["lab_id"])


def downgrade() -> None:
    op.drop_index("ix_record_shares_lab", table_name="record_shares")
    op.drop_index("ix_record_shares_entity", table_name="record_shares")
    op.drop_table("record_shares")
