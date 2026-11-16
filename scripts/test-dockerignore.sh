#!/usr/bin/env bash
# env-файлы не должны попадать в контекст сборки образов: Dockerfile делают COPY . .
# Тест кладет файлы-канарейки на разной глубине, собирает пробный образ из контекста
# (с его .dockerignore) и смотрит, что реально там лежит.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
T="$(mktemp -d)"
CAN=(backend/.env.canary backend/.env.production backend/app/.env.local
     frontend/.env.canary frontend/.env.local frontend/lib/.env.nested)
cleanup() { rm -rf "$T"; rm -f "${CAN[@]}"; }
trap cleanup EXIT
touch "${CAN[@]}"

cat > "$T/Dockerfile.probe" <<'DF'
FROM python:3.12-slim
ARG MARK
COPY . /ctx
RUN find /ctx -name '.env*' | sed 's/^/CTXENV /'; test -f "/ctx/${MARK}" && echo PROBE_PRESENT
DF

FAIL=0
probe() {  # контекст, файл-контроль
  local ctx="$1" mark="$2" log="$T/$1.log"
  if ! docker build --no-cache --progress=plain --build-arg "MARK=$mark" \
      -f "$T/Dockerfile.probe" "$ctx" >"$log" 2>&1; then
    echo "  ОШИБКА: $ctx: пробная сборка не удалась" >&2; tail -5 "$log" >&2; FAIL=1; return
  fi
  grep -qE '#[0-9]+ [0-9.]+ PROBE_PRESENT' "$log" \
    || { echo "  ОШИБКА: $ctx: проба пустая (нет $mark в контексте)" >&2; FAIL=1; return; }
  local leaks
  leaks="$(grep -E '#[0-9]+ [0-9.]+ CTXENV /ctx/' "$log" | sed 's/.*CTXENV //' || true)"
  if [ -n "$leaks" ]; then
    echo "  ОШИБКА: $ctx: env-файлы попали в контекст:" >&2; echo "$leaks" | sed 's/^/    /' >&2; FAIL=1
  else
    echo "  ok: $ctx: ни один env-файл не попал в контекст"
  fi
}
probe backend entrypoint.sh
probe frontend package.json
if [ "$FAIL" = 0 ]; then echo "ИТОГО: ок"; else exit 1; fi
