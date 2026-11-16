#!/bin/sh
# Поднимает схему backend-test/postgres-test с нуля на чистом volume.
#
# Почему НЕ через `alembic upgrade head`: baseline-миграция 0e90b5604472
# ("existing schema as of 2026-08-05") — пустышка (upgrade()=pass, стемп-маркер
# под уже существовавшую на тот момент базу). На чистой БД `alembic upgrade head`
# падает на первой же реальной миграции (38c49ba0cc46: ALTER TABLE users —
# таблицы users ещё нет). Переписывать baseline полной текущей схемой опасно:
# последующие ~N миграций попытаются создать/изменить то, что уже создано,
# и упадут на dev/prod, где alembic_version давно ушёл вперёд.
#
# Поэтому: создаём схему напрямую из текущих моделей (SQLAlchemy Base.metadata),
# затем `alembic stamp head` — говорим Alembic'у считать все миграции уже
# применёнными, не выполняя их. Безопасно ТОЛЬКО для одноразовой тестовой БД
# без истории; никогда не запускать на dev/prod.
#
# Когда нужно: после `docker compose down -v` (снёс pg_test_data), на новой
# машине/CI-раннере, или если postgres-test когда-либо создаётся с нуля.
set -e

echo "1/3: включаем расширение pgvector..."
docker compose exec -T postgres-test psql -U meridian -d meridian_test \
    -c "CREATE EXTENSION IF NOT EXISTS vector;"

echo "2/3: создаём схему из текущих моделей..."
docker compose exec -T backend-test python3 -c "
import asyncio
import app.models
import app.models.session  # не импортируется из __init__.py — регистрируем явно
from app.db.base import Base
from app.db.session import engine

async def main():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print('schema created')

asyncio.run(main())
"

echo "3/3: помечаем все миграции как применённые (без реального выполнения)..."
docker compose exec -T backend-test alembic stamp head

# `alembic stamp head` помечает ревизии применёнными, НЕ выполняя их — это
# ломает любую data-migration (INSERT/UPDATE, не DDL), т.к. create_all тоже
# не знает о них. Единственный известный на сегодня случай — системный
# пользователь (миграция a1b2c3d4e5f6, см. app/core/entity_registry.py) для
# ORM-driven event-log listener'а. Если появится ЕЩЁ одна data-migration —
# добавь её сюда же явным шагом, не полагайся на stamp.
echo "3.5/3: досеиваем данные, пропущенные stamp'ом (data-migrations)..."
docker compose exec -T postgres-test psql -U meridian -d meridian_test -c "
INSERT INTO users (username, email, password_hash, google_id, display_name, bio, is_active, is_verified, onboarding_completed, onboarding_step, default_visibility, avatar_url)
VALUES ('system', 'system@meridian.internal', NULL, NULL, 'Meridian System', 'Технический аккаунт — автор событий, созданных фоновыми процессами.', true, true, true, 0, 'private', NULL)
ON CONFLICT (username) DO NOTHING;
"

echo "готово — проверка:"
docker compose exec -T postgres-test psql -U meridian -d meridian_test -c "\dt" | tail -5
