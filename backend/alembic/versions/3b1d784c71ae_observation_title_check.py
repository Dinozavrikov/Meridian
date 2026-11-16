"""observations: CHECK — название не бывает пустым

Revision ID: 3b1d784c71ae
Revises: c395dfefc8d0
Идёт после бэкфилла c395dfefc8d0. Если в таблице остались пустые названия, ADD CONSTRAINT упадёт
с ошибкой, а не молча: заполни их и повтори.
"""
from alembic import op

revision = "3b1d784c71ae"
down_revision = "c395dfefc8d0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(r"""ALTER TABLE observations ADD CONSTRAINT observations_title_not_blank CHECK (title !~ '^\s*$')""")


def downgrade() -> None:
    op.execute("ALTER TABLE observations DROP CONSTRAINT IF EXISTS observations_title_not_blank")
