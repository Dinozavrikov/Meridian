"""prediction_calibration_residue: «сухой остаток» окончательно удалённых прогнозов

Revision ID: e1a8c6d3f024
Revises: c4a9d7e2b135
Create Date: 2026-09-24 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = 'e1a8c6d3f024'
down_revision: Union[str, None] = 'c4a9d7e2b135'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_T = "prediction_calibration_residue"


def upgrade() -> None:
    # Таблица создаётся пустой: до этого шага окончательного удаления прогнозов
    # через корзину не было, backfill не нужен. См. модель PredictionCalibrationResidue.
    op.create_table(
        _T,
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("visibility", sa.String(length=16), nullable=False, server_default="private"),
        sa.Column("lab_id", sa.Integer(), sa.ForeignKey("labs.id", ondelete="SET NULL"), nullable=True),
        sa.Column("confidence", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=64), nullable=False),
        sa.Column("is_onboarding", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("tag_names", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("purged_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index(f"ix_{_T}_user_id", _T, ["user_id"])
    op.create_index(f"ix_{_T}_visibility", _T, ["visibility"])
    op.create_index(f"ix_{_T}_lab_id", _T, ["lab_id"])


def downgrade() -> None:
    # Внимание: откат стирает остатки — окончательно удалённые прогнозы перестанут
    # учитываться в калибровке.
    op.drop_index(f"ix_{_T}_lab_id", table_name=_T)
    op.drop_index(f"ix_{_T}_visibility", table_name=_T)
    op.drop_index(f"ix_{_T}_user_id", table_name=_T)
    op.drop_table(_T)
