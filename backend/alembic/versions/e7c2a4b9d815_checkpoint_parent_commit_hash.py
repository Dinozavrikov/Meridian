"""checkpoint parent_commit_hash: хеш родителя хранится в самом снимке

Revision ID: e7c2a4b9d815
Revises: d3a9f5c1b7e2
"""
from alembic import op
import sqlalchemy as sa

revision = "e7c2a4b9d815"
down_revision = "d3a9f5c1b7e2"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("lab_checkpoints", sa.Column("parent_commit_hash", sa.String(length=64), nullable=True))
    op.execute("UPDATE lab_checkpoints c SET parent_commit_hash = p.commit_hash "
               "FROM lab_checkpoints p WHERE c.parent_id = p.id")


def downgrade():
    op.drop_column("lab_checkpoints", "parent_commit_hash")
