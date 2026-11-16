"""add system user for orm-driven event log

Revision ID: a1b2c3d4e5f6
Revises: 0c5efcb50b87
Create Date: 2026-09-18 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = '0c5efcb50b87'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Технический пользователь-автор для событий, которые пишет ORM-уровень
    # (before_flush-listener event-log'а), а не HTTP-роут — там неоткуда
    # взять actor_id из контекста запроса (фоновые джобы вроде
    # prediction_reminders.py). ON CONFLICT DO NOTHING — идемпотентно,
    # безопасно перезапускать миграцию/тестовую БД.
    # id намеренно НЕ указывается явно — вставляется через обычный
    # nextval() users_id_seq, чтобы не рассинхронизировать последовательность
    # с будущими обычными регистрациями. Искать этого пользователя в коде
    # нужно по username='system', не по id.
    op.execute("""
        INSERT INTO users (
            username, email, password_hash, google_id,
            display_name, bio, is_active, is_verified,
            onboarding_completed, onboarding_step, default_visibility,
            avatar_url
        ) VALUES (
            'system', 'system@meridian.internal', NULL, NULL,
            'Meridian System', 'Технический аккаунт — автор событий, созданных фоновыми процессами (не пользовательское действие).',
            true, true, true, 0, 'private', NULL
        )
        ON CONFLICT (username) DO NOTHING
    """)


def downgrade() -> None:
    op.execute("DELETE FROM users WHERE username = 'system'")
