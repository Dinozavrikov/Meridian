"""maturity_suggestions: не более одного pending-предложения на гипотезу (частичный уникальный индекс)

Revision ID: f7a1c3d9e052
Revises: e63f9a2c5b18
"""
from alembic import op

revision = "f7a1c3d9e052"
down_revision = "e63f9a2c5b18"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # лишние pending (если вдруг есть) помечаем отклонёнными, оставляем самый новый
    op.execute("""
        UPDATE maturity_suggestions SET status = 'dismissed'
        WHERE status = 'pending' AND id NOT IN (
            SELECT max(id) FROM maturity_suggestions WHERE status = 'pending' GROUP BY hypothesis_id)
    """)
    op.execute("CREATE UNIQUE INDEX uq_maturity_suggestions_one_pending ON maturity_suggestions (hypothesis_id) WHERE status = 'pending'")


def downgrade() -> None:
    op.execute("DROP INDEX uq_maturity_suggestions_one_pending")
