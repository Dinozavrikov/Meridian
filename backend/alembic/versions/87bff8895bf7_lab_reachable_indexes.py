"""lab_reachable_indexes

Revision ID: 87bff8895bf7
Revises: 38c49ba0cc46
Create Date: 2026-08-06 10:24:16.715034

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '87bff8895bf7'
down_revision: Union[str, None] = '38c49ba0cc46'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # lab_reachable_ids раньше грузил всю таблицу links/entity_hypotheses/
    # predictions без WHERE (O(весь граф базы) на каждый list-запрос).
    # Индексы ниже позволяют переписать её на SQL-запросы, ограниченные
    # конкретным frontier'ом (сущности лаб пользователя), а не всей базой.
    op.create_index("ix_links_from", "links", ["from_type", "from_id"])
    op.create_index("ix_links_to", "links", ["to_type", "to_id"])
    # Composite PK (parent_type, parent_id, hypothesis_id) уже покрывает
    # поиск "от родителя к гипотезе"; для обратного направления нужен
    # отдельный индекс на hypothesis_id.
    op.create_index("ix_entity_hypotheses_hypothesis_id", "entity_hypotheses", ["hypothesis_id"])
    # FK без индекса — использовался для обратного поиска (BFS, а также
    # stats.py join Prediction->Hypothesis) без поддержки индекса вообще.
    op.create_index("ix_predictions_hypothesis_id", "predictions", ["hypothesis_id"])


def downgrade() -> None:
    op.drop_index("ix_predictions_hypothesis_id", table_name="predictions")
    op.drop_index("ix_entity_hypotheses_hypothesis_id", table_name="entity_hypotheses")
    op.drop_index("ix_links_to", table_name="links")
    op.drop_index("ix_links_from", table_name="links")
