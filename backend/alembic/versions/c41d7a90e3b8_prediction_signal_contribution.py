"""predictions.signal_contribution: вклад закрытого прогноза в сигнал гипотезы (у старых закрытых NULL: не сохранён)

Revision ID: c41d7a90e3b8
Revises: 82767994fe45
"""
from alembic import op
import sqlalchemy as sa

revision = "c41d7a90e3b8"
down_revision = "82767994fe45"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # без бэкфилла: у старых закрытых прогнозов вклад на момент закрытия неизвестен, задним числом не дорисовываем
    op.add_column("predictions", sa.Column("signal_contribution", sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column("predictions", "signal_contribution")
