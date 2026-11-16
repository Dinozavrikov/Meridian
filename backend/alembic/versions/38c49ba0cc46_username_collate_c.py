"""username_collate_c

Revision ID: 38c49ba0cc46
Revises: 0e90b5604472
Create Date: 2026-08-05 20:16:24.107290

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '38c49ba0cc46'
down_revision: Union[str, None] = '0e90b5604472'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # COLLATE "C" — побайтовое сравнение, не зависит от версии glibc/ICU на хосте.
    # ALTER COLUMN TYPE переписывает таблицу и автоматически перестраивает
    # зависимые индексы (в т.ч. уникальный ix_users_username) под новый collation —
    # отдельный REINDEX не нужен.
    op.execute('ALTER TABLE users ALTER COLUMN username TYPE VARCHAR(64) COLLATE "C"')


def downgrade() -> None:
    op.execute('ALTER TABLE users ALTER COLUMN username TYPE VARCHAR(64) COLLATE "en_US.utf8"')
