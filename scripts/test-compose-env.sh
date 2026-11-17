#!/usr/bin/env bash
# Настройки из окружения/.env обязаны доходить до контейнеров: COOKIE_SECURE и CORS_ORIGINS до backend,
# TURNSTILE_SITE_KEY до сборки frontend. Раньше COOKIE_SECURE не передавался вовсе, а CORS и ключ
# Turnstile были зашиты в compose.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
FAIL=0
cfg() {  # python-выражение над d, затем префикс env
  local expr="$1"; shift
  env "$@" docker compose --env-file .env.example -f docker-compose.yml config --format json 2>/dev/null \
    | python3 -c "import json,sys; d=json.load(sys.stdin); print($expr)"
}
check() {  # название, получено, ожидалось
  if [ "$2" = "$3" ]; then echo "  ok: $1"; else echo "  ОШИБКА: $1: ожидалось '$3', получено '$2'" >&2; FAIL=1; fi
}
BE='d["services"]["backend"]["environment"]'
FE='d["services"]["frontend"]["build"]["args"]'
check "COOKIE_SECURE=true доходит до backend"  "$(cfg "$BE.get('COOKIE_SECURE','<нет>')" COOKIE_SECURE=true)"  "true"
check "COOKIE_SECURE=false доходит до backend" "$(cfg "$BE.get('COOKIE_SECURE','<нет>')" COOKIE_SECURE=false)" "false"
check "без COOKIE_SECURE пусто (автоматически)" "$(cfg "$BE.get('COOKIE_SECURE','<нет>')" -u COOKIE_SECURE)"    ""
check "CORS_ORIGINS из окружения"              "$(cfg "$BE['CORS_ORIGINS']" CORS_ORIGINS=https://a.example)"     "https://a.example"
check "CORS_ORIGINS по умолчанию localhost"    "$(cfg "$BE['CORS_ORIGINS']" -u CORS_ORIGINS)"                    "http://localhost:3000"
check "TURNSTILE_SITE_KEY попадает в сборку frontend" "$(cfg "$FE['NEXT_PUBLIC_TURNSTILE_SITE_KEY']" TURNSTILE_SITE_KEY=abc123)" "abc123"
check "frontend по умолчанию ходит в API по относительному адресу" "$(cfg "$FE['NEXT_PUBLIC_API_URL']" -u NEXT_PUBLIC_API_URL)" ""
if [ "$FAIL" = 0 ]; then echo "ИТОГО: ок"; else exit 1; fi
