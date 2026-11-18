#!/usr/bin/env bash
# Проверяет Caddyfile на настоящем Caddy с заглушками вместо backend и frontend: маршрутизация,
# лимит тела запроса и главное: заголовок X-Real-IP, которому доверяет backend, всегда
# перезаписывается адресом клиента и не подделывается.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
N="meridian-proxy-test-$$"
PORT="${PROXY_TEST_PORT:-18099}"
T="$(mktemp -d)"
FAIL=0
ok()  { echo "  ok: $1"; }
bad() { echo "  ОШИБКА: $1" >&2; FAIL=1; }
cleanup() { docker rm -f "$N-caddy" "$N-api" "$N-web" >/dev/null 2>&1 || true; docker network rm "$N" >/dev/null 2>&1 || true; rm -rf "$T"; }
trap cleanup EXIT

docker network create "$N" >/dev/null
docker run -d --rm --name "$N-api" --network "$N" --network-alias backend traefik/whoami --port 8000 --name backend-stub >/dev/null
docker run -d --rm --name "$N-web" --network "$N" --network-alias frontend traefik/whoami --port 3000 --name frontend-stub >/dev/null
docker run -d --name "$N-caddy" --network "$N" -p "127.0.0.1:$PORT:8080" -e SITE_ADDRESS=":8080" \
  -v "${CADDYFILE:-$PWD/Caddyfile}:/etc/caddy/Caddyfile:ro" caddy:2-alpine >/dev/null
for _ in $(seq 1 30); do curl -fsS -m 2 "http://127.0.0.1:$PORT/" >/dev/null 2>&1 && break; sleep 1; done
if [ "$(docker inspect -f '{{.State.Running}}' "$N-caddy" 2>/dev/null)" != "true" ]; then
  echo "Caddy не запустился:" >&2; docker logs "$N-caddy" 2>&1 | tail -6 >&2; exit 1
fi

get() { curl -s -m 5 "$@"; }
U="http://127.0.0.1:$PORT"
get "$U/api/health" | grep -q "^Name: backend-stub" && ok "/api идет в backend" || bad "/api не попал в backend"
get "$U/api/uploads/a.png" | grep -q "^Name: backend-stub" && ok "/api/uploads идет в backend" || bad "/api/uploads не попал в backend"
get "$U/features" | grep -q "^Name: frontend-stub" && ok "страницы идут во frontend" || bad "страница не попала во frontend"

spoof="$(get -H "X-Real-IP: 6.6.6.6" "$U/api/x" | grep -i "^X-Real-Ip:" || true)"
if [ -z "$spoof" ]; then bad "backend не получил X-Real-IP"
elif echo "$spoof" | grep -q "6\.6\.6\.6"; then bad "клиент подделал X-Real-IP: $spoof"
else ok "X-Real-IP перезаписан адресом клиента ($spoof)"; fi

head -c 21000000 /dev/zero > "$T/big.bin"
code="$(curl -s -o /dev/null -m 30 -w '%{http_code}' -X POST --data-binary @"$T/big.bin" "$U/api/x" || true)"
[ "$code" = 413 ] && ok "запрос больше 20 МБ отклоняется (413)" || bad "ожидал 413, получил $code"
head -c 1000000 /dev/zero > "$T/small.bin"
small="$(curl -s -o /dev/null -m 15 -w '%{http_code}' -X POST --data-binary @"$T/small.bin" "$U/api/x" || true)"
[ "$small" = 200 ] && ok "запрос в 1 МБ проходит" || bad "запрос в 1 МБ: код $small"

# The backend restarts (a deploy or git pull): Caddy must keep retrying instead of answering 502.
docker stop "$N-api" >/dev/null
( sleep 3; docker run -d --rm --name "$N-api" --network "$N" --network-alias backend traefik/whoami --port 8000 --name backend-stub >/dev/null ) &
code="$(curl -s -o "$T/restart.out" -m 20 -w '%{http_code}' -X POST -d x "$U/api/x" || true)"
wait
if [ "$code" = 200 ] && grep -q "^Name: backend-stub" "$T/restart.out"; then ok "запрос во время перезапуска backend дождался его (не 502)"
else bad "запрос во время перезапуска backend: код $code (ожидал 200 после повторов)"; fi

if [ "$FAIL" = 0 ]; then echo "ИТОГО: ок"; else echo "ИТОГО: есть ошибки" >&2; exit 1; fi
