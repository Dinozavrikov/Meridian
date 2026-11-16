#!/usr/bin/env bash
# node/npm на dev-машине НЕ установлены — команды фронтенда выполняются в
# контейнере того же node-образа, что и прод-сборка (см. Dockerfile):
#   ./fe.sh npm test | ./fe.sh npx tsc --noEmit | ./fe.sh npm install <пакет>
# Монтируется корень репозитория (а не только frontend/): тесты сверяются с
# бэкендом (lib/attachments.test.ts читает ../backend/...).
set -euo pipefail
cd "$(dirname "$0")"
ROOT="$(cd .. && pwd)"
IMG="$(grep -iE '^FROM[[:space:]]+node' Dockerfile | head -1 | awk '{print $2}')"
[ -n "${IMG}" ] || { echo "fe.sh: не нашёл node-образ в Dockerfile" >&2; exit 1; }
exec docker run --rm -u "$(id -u):$(id -g)" -e HOME=/tmp -e npm_config_cache=/tmp/.npm \
  -e npm_config_update_notifier=false -e NEXT_TELEMETRY_DISABLED=1 \
  -v "${ROOT}:/repo" -w /repo/frontend "${IMG}" "$@"
