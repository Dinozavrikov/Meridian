"""prediction_calibration_residue: hypothesis_id и lab_signal_contribution, чтобы окончательное удаление не стирало вклад в сигнал лаборатории (у старых остатков NULL: не сохранён)

Revision ID: e63f9a2c5b18
Revises: d52e8b1f4a07
"""
from alembic import op
import sqlalchemy as sa

revision = "e63f9a2c5b18"
down_revision = "d52e8b1f4a07"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # без бэкфилла: вклад уже стёртых прогнозов не восстановить
    op.add_column("prediction_calibration_residue", sa.Column(
        "hypothesis_id", sa.Integer(), sa.ForeignKey("hypotheses.id", ondelete="SET NULL"), nullable=True))
    op.add_column("prediction_calibration_residue", sa.Column("lab_signal_contribution", sa.Float(), nullable=True))
    op.create_index("ix_prediction_calibration_residue_hypothesis_id", "prediction_calibration_residue", ["hypothesis_id"])


def downgrade() -> None:
    op.drop_index("ix_prediction_calibration_residue_hypothesis_id", table_name="prediction_calibration_residue")
    op.drop_column("prediction_calibration_residue", "lab_signal_contribution")
    op.drop_column("prediction_calibration_residue", "hypothesis_id")
