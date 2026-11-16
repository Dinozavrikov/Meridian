"""Удалить сохранённые тексты сбоев ИИ из выводов рефлексии

Revision ID: 9b26391fbbe4
Revises: a4e8c1d97b30
"""
from alembic import op

from app.services.ai_error_cleanup import PURGE_SQL

revision = "9b26391fbbe4"
down_revision = "a4e8c1d97b30"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(PURGE_SQL)


def downgrade() -> None:
    pass  # удалённый мусор (тексты исключений) не восстанавливается
