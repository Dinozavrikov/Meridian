"""slug: откат к простому глобальному UniqueConstraint + случайный суффикс вместо partial-scope

Решение продукта пересмотрено: вариант с partial-уникальностью по scope и
автопереименованием при конфликте (миграция b2f7a1c9e408) устранял исходный
баг (см. её докстринг), но ценой четырёх точек риска (смена lab_id, restore,
delete_lab, disambiguation при чтении по slug). Правильнее не допускать
конфликт вовсе — slug теперь всегда получает случайный суффикс (см.
app/core/slug.py::unique_slug_for), поэтому можно вернуть простую глобальную
уникальность без всякого partial/scope.

Revision ID: f4d8b6c2a913
Revises: b2f7a1c9e408
Create Date: 2026-09-25 12:00:00.000000
"""
import secrets
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'f4d8b6c2a913'
down_revision: Union[str, None] = 'b2f7a1c9e408'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TABLES = ("observations", "hypotheses", "predictions", "worldview", "questions", "research_tasks")
_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789"


def _random_suffix() -> str:
    return "".join(secrets.choice(_ALPHABET) for _ in range(6))


def upgrade() -> None:
    bind = op.get_bind()

    # Защитный шаг: пока действовала partial-уникальность, разные пользователи/
    # лабы могли легитимно получить одинаковый slug (это и было целью той схемы).
    # Глобальный constraint это больше не пропустит — разруливаем сами, а не падаем
    # на CREATE UNIQUE CONSTRAINT: у всех, кроме первой (по created_at) записи с
    # повторяющимся slug, добавляем случайный суффикс.
    for t in _TABLES:
        dup_groups = bind.execute(sa.text(f"""
            SELECT slug, array_agg(id ORDER BY created_at) AS ids
            FROM {t} WHERE slug != '' GROUP BY slug HAVING count(*) > 1
        """)).all()
        for slug, ids in dup_groups:
            for dup_id in ids[1:]:
                for _ in range(5):
                    new_slug = f"{slug}-{_random_suffix()}"
                    clash = bind.execute(
                        sa.text(f"SELECT 1 FROM {t} WHERE slug = :s"), {"s": new_slug}
                    ).first()
                    if not clash:
                        break
                bind.execute(
                    sa.text(f"UPDATE {t} SET slug = :s WHERE id = :i"), {"s": new_slug, "i": dup_id}
                )

    for t in _TABLES:
        op.drop_index(f"{t}_slug_lab_unique", table_name=t)
        op.drop_index(f"{t}_slug_personal_unique", table_name=t)
        op.create_unique_constraint(f"{t}_slug_unique", t, ["slug"])

    # entity_slug_history больше не пишется никем (см. core/slug.py) — мёртвый код,
    # сносим саму таблицу, а не оставляем висеть "на всякий случай".
    op.drop_table("entity_slug_history")


def downgrade() -> None:
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
    for t in _TABLES:
        op.drop_constraint(f"{t}_slug_unique", t, type_="unique")
        op.create_index(
            f"{t}_slug_personal_unique", t, ["user_id", "slug"], unique=True,
            postgresql_where=sa.text("lab_id IS NULL AND deleted_at IS NULL"),
        )
        op.create_index(
            f"{t}_slug_lab_unique", t, ["lab_id", "slug"], unique=True,
            postgresql_where=sa.text("lab_id IS NOT NULL AND deleted_at IS NULL"),
        )
