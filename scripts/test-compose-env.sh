#!/usr/bin/env bash
# COOKIE_SECURE из окружения/.env обязан доходить до backend. Раньше compose его не передавал:
# на проде куки входа уходили без флага Secure, хотя конфиг просил включить.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
FAIL=0
backend_cookie() {  # аргументы — префикс для env (VAR=значение или -u VAR)
  env "$@" docker compose --env-file .env.example -f docker-compose.yml config --format json 2>/dev/null \
    | python3 -c 'import json,sys; print(json.load(sys.stdin)["services"]["backend"]["environment"].get("COOKIE_SECURE", "<нет>"))'
}
check() {  # название, получено, ожидалось
  if [ "$2" = "$3" ]; then echo "  ok: $1"; else echo "  ОШИБКА: $1: ожидалось '$3', получено '$2'" >&2; FAIL=1; fi
}
check "COOKIE_SECURE=true доходит до backend"  "$(backend_cookie COOKIE_SECURE=true)"  "true"
check "COOKIE_SECURE=false доходит до backend" "$(backend_cookie COOKIE_SECURE=false)" "false"
check "без переменной по умолчанию false"      "$(backend_cookie -u COOKIE_SECURE)"    "false"
if [ "$FAIL" = 0 ]; then echo "ИТОГО: ок"; else exit 1; fi
