"""observations: заполнить пустые title (title теперь обязателен)

Revision ID: c395dfefc8d0
Revises: e7c2a4b9d815
"""
from alembic import op

revision = "c395dfefc8d0"
down_revision = "e7c2a4b9d815"
branch_labels = None
depends_on = None


def upgrade() -> None:
    if op.get_bind().dialect.name != "postgresql":
        raise RuntimeError("Бэкфилл title написан под PostgreSQL (regexp_replace)")
    # Текст без тегов -> сущности -> схлопнутые пробелы -> первые 60 символов.
    # Теги вырезаются ДО раскрытия сущностей, иначе &lt;b&gt; превратится в тег и пропадёт.
    op.execute(r"""
        UPDATE observations
        SET title = COALESCE(
            NULLIF(btrim(left(btrim(regexp_replace(
                replace(replace(replace(replace(replace(
                    regexp_replace(text, '<[^>]*>', ' ', 'g'),
                '&nbsp;', ' '), '&lt;', '<'), '&gt;', '>'), '&quot;', '"'), '&amp;', '&'),
                '\s+', ' ', 'g')), 60)), ''),
            'Наблюдение от ' || date)
        WHERE btrim(title) = ''
    """)


def downgrade() -> None:
    pass  # данные не откатываются: прежние пустые title восстановить нечем
