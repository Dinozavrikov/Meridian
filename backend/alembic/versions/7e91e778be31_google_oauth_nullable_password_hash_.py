"""google oauth: nullable password_hash, google_id

Revision ID: 7e91e778be31
Revises: a7c3f1e9b204
Create Date: 2026-09-06 09:25:30.573852

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7e91e778be31'
down_revision: Union[str, None] = 'a7c3f1e9b204'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Google OAuth аккаунты не имеют пароля — password_hash становится
    # опциональным. google_id хранит sub из Google ID-токена (устойчивый
    # уникальный идентификатор, не email — email можно сменить в Google-
    # аккаунте, sub никогда). unique+nullable: обычные юзеры без Google
    # получают NULL, дублей быть не может.
    op.alter_column("users", "password_hash", existing_type=sa.String(255), nullable=True)
    op.add_column("users", sa.Column("google_id", sa.String(64), nullable=True))
    op.create_unique_constraint("uq_users_google_id", "users", ["google_id"])


def downgrade() -> None:
    op.drop_constraint("uq_users_google_id", "users", type_="unique")
    op.drop_column("users", "google_id")
    op.alter_column("users", "password_hash", existing_type=sa.String(255), nullable=False)
