"""slug: partial unique-индексы (personal/lab) вместо глобального constraint + EntitySlugHistory

Revision ID: b2f7a1c9e408
Revises: e1a8c6d3f024
Create Date: 2026-09-25 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'b2f7a1c9e408'
down_revision: Union[str, None] = 'e1a8c6d3f024'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TABLES = ("observations", "hypotheses", "predictions", "worldview", "questions", "research_tasks")
_OLD_CONSTRAINT = {
    "observations": "observations_slug_unique", "hypotheses": "hypotheses_slug_unique",
    "predictions": "predictions_slug_unique", "worldview": "worldview_slug_unique",
    "questions": "questions_slug_unique", "research_tasks": "research_tasks_slug_unique",
}


def upgrade() -> None:
    bind = op.get_bind()

    # п.5 ТЗ: явная проверка дублей ПЕРЕД созданием индексов — падаем с понятным
    # сообщением, а не непонятным IntegrityError на CREATE UNIQUE INDEX.
    problems = []
    for t in _TABLES:
        rows = bind.execute(sa.text(f"""
            SELECT user_id, slug, count(*) FROM {t}
            WHERE lab_id IS NULL AND deleted_at IS NULL AND slug != ''
            GROUP BY user_id, slug HAVING count(*) > 1
        """)).all()
        if rows:
            problems.append(f"{t} (personal): {rows}")
        rows = bind.execute(sa.text(f"""
            SELECT lab_id, slug, count(*) FROM {t}
            WHERE lab_id IS NOT NULL AND deleted_at IS NULL AND slug != ''
            GROUP BY lab_id, slug HAVING count(*) > 1
        """)).all()
        if rows:
            problems.append(f"{t} (lab): {rows}")
    if problems:
        raise RuntimeError(
            "Найдены дубли slug, которые новые partial-индексы не пропустят — "
            "разрешите вручную перед миграцией:\n" + "\n".join(problems)
        )

    for t in _TABLES:
        op.drop_constraint(_OLD_CONSTRAINT[t], t, type_="unique")
        op.create_index(
            f"{t}_slug_personal_unique", t, ["user_id", "slug"], unique=True,
            postgresql_where=sa.text("lab_id IS NULL AND deleted_at IS NULL"),
        )
        op.create_index(
            f"{t}_slug_lab_unique", t, ["lab_id", "slug"], unique=True,
            postgresql_where=sa.text("lab_id IS NOT NULL AND deleted_at IS NULL"),
        )

    op.create_table(
        "entity_slug_history",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("entity_type", sa.String(length=32), nullable=False),
        sa.Column("old_slug", sa.String(length=80), nullable=False),
        sa.Column("entity_id", sa.Integer(), nullable=False),
        sa.Column("replaced_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_entity_slug_history_entity_type", "entity_slug_history", ["entity_type"])
    op.create_unique_constraint(
        "entity_slug_history_type_slug_unique", "entity_slug_history", ["entity_type", "old_slug"]
    )


def downgrade() -> None:
    op.drop_constraint("entity_slug_history_type_slug_unique", "entity_slug_history", type_="unique")
    op.drop_index("ix_entity_slug_history_entity_type", table_name="entity_slug_history")
    op.drop_table("entity_slug_history")
    for t in _TABLES:
        op.drop_index(f"{t}_slug_lab_unique", table_name=t)
        op.drop_index(f"{t}_slug_personal_unique", table_name=t)
        # Внимание: откат возвращает ГЛОБАЛЬНЫЙ constraint — если к этому моменту
        # два разных пользователя уже получили одинаковый slug благодаря partial-
        # индексам, откат упадёт. Разрешить дубли вручную перед downgrade.
        op.create_unique_constraint(_OLD_CONSTRAINT[t], t, ["slug"])
