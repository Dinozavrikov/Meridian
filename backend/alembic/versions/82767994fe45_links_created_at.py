"""links.created_at: когда создана связь (у старых связей NULL: дата неизвестна)

Revision ID: 82767994fe45
Revises: e52c31389da9
"""
from alembic import op
import sqlalchemy as sa

revision = "82767994fe45"
down_revision = "e52c31389da9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # сначала колонка без значения (старые строки остаются NULL), и только потом умолчание для новых
    op.add_column("links", sa.Column("created_at", sa.DateTime(timezone=True), nullable=True))
    op.alter_column("links", "created_at", server_default=sa.text("now()"))


def downgrade() -> None:
    op.drop_column("links", "created_at")
