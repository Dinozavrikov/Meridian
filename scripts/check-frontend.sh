#!/usr/bin/env bash
# Проверки фронтенда перед деплоем: типы, unit-тесты, браузерные тесты. Любое падение — ненулевой код возврата.
# tsc и unit идут через frontend/fe.sh (контейнер). Браузерные тесты (реальная раскладка, Chromium)
# идут на хосте: Chromium в контейнере не держим, чтобы не раздувать образ.
set -euo pipefail
cd "$(dirname "$0")/../frontend"
echo "==> tsc --noEmit"
./fe.sh npx tsc --noEmit
echo "==> vitest (unit)"
./fe.sh npm test
echo "==> vitest (browser, на хосте)"
command -v npm >/dev/null || { echo "ОШИБКА: на хосте нет npm, браузерные тесты нечем запустить (SKIP_CHECKS=1 обходит гейт осознанно)"; exit 1; }
npm run test:browser || { echo "ОШИБКА: браузерные тесты красные или нет Chromium (npx playwright install chromium)"; exit 1; }
echo "==> Проверки фронтенда пройдены"
