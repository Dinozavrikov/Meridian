#!/usr/bin/env sh
set -e
echo "==> Применяем миграции Alembic (upgrade head, с advisory lock)"
python -m scripts.migrate_with_lock

if [ "$#" -gt 0 ]; then
  echo "==> Запускаем переданную команду: $@"
  exec "$@"
else
  echo "==> Запускаем uvicorn"
  exec uvicorn app.main:app --host 0.0.0.0 --port 8000
fi
