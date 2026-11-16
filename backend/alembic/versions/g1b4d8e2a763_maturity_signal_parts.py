"""maturity_suggestions: составные части сигнала (прогнозы, наблюдения, лаборатория); у старых строк NULL

Revision ID: g1b4d8e2a763
Revises: f7a1c3d9e052
"""
from alembic import op
import sqlalchemy as sa

revision = "g1b4d8e2a763"
down_revision = "f7a1c3d9e052"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for c in ("pred_signal", "obs_signal", "lab_signal"):
        op.add_column("maturity_suggestions", sa.Column(c, sa.Float(), nullable=True))


def downgrade() -> None:
    for c in ("lab_signal", "obs_signal", "pred_signal"):
        op.drop_column("maturity_suggestions", c)
