"""add lab checkpoints (снимки лабы)

Revision ID: d3a9f5c1b7e2
Revises: 77ca70f190c0
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "d3a9f5c1b7e2"
down_revision = "77ca70f190c0"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "lab_checkpoints",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("lab_id", sa.Integer(), nullable=False),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.Column("parent_id", sa.Integer(), nullable=True),
        sa.Column("title", sa.String(length=120), nullable=True),
        sa.Column("is_published", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("published_by", sa.Integer(), nullable=True),
        sa.Column("schema_version", sa.Integer(), nullable=False),
        sa.Column("tree_hash", sa.String(length=64), nullable=False),
        sa.Column("commit_hash", sa.String(length=64), nullable=False),
        sa.Column("item_count", sa.Integer(), nullable=False),
        sa.Column("blob_bytes", sa.BigInteger(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["lab_id"], ["labs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["parent_id"], ["lab_checkpoints.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["published_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_lab_checkpoints_lab_id", "lab_checkpoints", ["lab_id"])
    op.create_index("ix_lab_checkpoints_commit_hash", "lab_checkpoints", ["commit_hash"])
    op.create_index("uq_lab_checkpoints_root", "lab_checkpoints", ["lab_id"], unique=True,
                    postgresql_where=sa.text("parent_id IS NULL"))
    op.create_index("uq_lab_checkpoints_child", "lab_checkpoints", ["lab_id", "parent_id"], unique=True,
                    postgresql_where=sa.text("parent_id IS NOT NULL"))

    op.create_table(
        "lab_checkpoint_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("checkpoint_id", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(length=32), nullable=False),
        sa.Column("entity_type", sa.String(length=32), nullable=False),
        sa.Column("entity_id", sa.Integer(), nullable=True),
        sa.Column("object_key", sa.String(length=160), nullable=False),
        sa.Column("snapshot_data", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("item_hash", sa.String(length=64), nullable=False),
        sa.Column("blob_sha256", sa.String(length=64), nullable=True),
        sa.Column("blob_size", sa.BigInteger(), nullable=True),
        sa.ForeignKeyConstraint(["checkpoint_id"], ["lab_checkpoints.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("checkpoint_id", "object_key", name="uq_lab_checkpoint_items_key"),
    )
    op.create_index("ix_lab_checkpoint_items_blob_sha256", "lab_checkpoint_items", ["blob_sha256"])
    op.create_index("ix_lab_checkpoint_items_kind", "lab_checkpoint_items", ["checkpoint_id", "kind"])
    op.create_index("ix_lab_checkpoint_items_entity", "lab_checkpoint_items", ["checkpoint_id", "entity_type", "entity_id"])


def downgrade():
    op.drop_table("lab_checkpoint_items")
    op.drop_table("lab_checkpoints")
