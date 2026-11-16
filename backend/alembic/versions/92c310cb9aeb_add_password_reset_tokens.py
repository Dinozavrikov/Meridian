"""add password_reset_tokens table

Revision ID: 92c310cb9aeb
Revises: 7e91e778be31
Create Date: 2026-09-12 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '92c310cb9aeb'
down_revision: Union[str, None] = '7e91e778be31'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Храним хэш токена (sha256), не сам токен — та же логика, что и с
    # password_hash: утечка БД не должна давать готовые ссылки для сброса
    # чужих паролей. used_at вместо физического удаления — позволяет отличить
    # "уже использован" от "никогда не существовал" при отладке инцидентов.
    op.create_table(
        "password_reset_tokens",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("token_hash", sa.String(length=64), nullable=False, unique=True, index=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("password_reset_tokens")
