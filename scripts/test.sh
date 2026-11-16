#!/usr/bin/env bash
# Тесты бэкенда: ./scripts/test.sh [аргументы pytest]. Без аргументов - весь набор.
# НЕ запускай "docker compose run backend-test pytest": entrypoint = sleep infinity, команда зависнет.
set -euo pipefail
cd "$(dirname "$0")/.."
docker compose up -d backend-test >/dev/null
h=$(md5sum backend/app/services/ai.py | cut -d' ' -f1)
c=$(docker compose exec -T backend-test md5sum /app/app/services/ai.py | cut -d' ' -f1)
if [ "$h" != "$c" ]; then
  echo "ОШИБКА: код в контейнере не совпадает с рабочей копией (тесты шли бы по старому коду)." >&2
  echo "Проверь volumes у backend-test или пересоздай: docker compose up -d --force-recreate backend-test" >&2
  exit 1
fi
[ $# -eq 0 ] && set -- tests
docker compose exec -T backend-test pytest "$@" -q
