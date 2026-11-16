"""predictions.lab_signal_contribution: вклад закрытого прогноза в сигнал лаборатории (у старых NULL: не сохранён)

Revision ID: d52e8b1f4a07
Revises: c41d7a90e3b8
"""
from alembic import op
import sqlalchemy as sa

revision = "d52e8b1f4a07"
down_revision = "c41d7a90e3b8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # без бэкфилла: задним числом вклад не восстанавливается
    op.add_column("predictions", sa.Column("lab_signal_contribution", sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column("predictions", "lab_signal_contribution")
