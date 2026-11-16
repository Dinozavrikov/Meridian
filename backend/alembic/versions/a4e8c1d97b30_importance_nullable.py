"""observations/questions: importance может быть пустым («не оценено»)

Revision ID: a4e8c1d97b30
Revises: 3b1d784c71ae
Существующие значения не меняются: все старые записи остаются «оценёнными» (решение 13.10).
Снимаем NOT NULL и серверное значение по умолчанию (если оно было); NULL = «не оценено».
Downgrade необратим без потерь: пустые значения превращаются в 0.
"""
from alembic import op

revision = "a4e8c1d97b30"
down_revision = "3b1d784c71ae"
branch_labels = None
depends_on = None

_TABLES = ("observations", "questions")


def upgrade() -> None:
    for t in _TABLES:
        op.execute(f"ALTER TABLE {t} ALTER COLUMN importance DROP NOT NULL, ALTER COLUMN importance DROP DEFAULT")


def downgrade() -> None:
    for t in _TABLES:
        op.execute(f"UPDATE {t} SET importance = 0 WHERE importance IS NULL")
        op.execute(f"ALTER TABLE {t} ALTER COLUMN importance SET NOT NULL")
