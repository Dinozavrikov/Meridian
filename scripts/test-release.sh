#!/usr/bin/env bash
# Проверка scripts/release.sh на временном репозитории (настоящие git, sed и awk).
set -euo pipefail
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
R="$T/r"
FAIL=0
ok()  { echo "  ok: $1"; }
bad() { echo "  ОШИБКА: $1" >&2; FAIL=1; }

mkrepo() {  # $1 — версия, $2 — запись в [Unreleased]
  rm -rf "$R"; mkdir -p "$R/scripts" "$R/frontend"
  cp "$SRC/scripts/release.sh" "$R/scripts/release.sh"
  printf '{\n  "name": "frontend",\n  "version": "%s",\n  "private": true\n}\n' "$1" > "$R/frontend/package.json"
  printf '{\n  "name": "frontend",\n  "version": "%s",\n  "lockfileVersion": 3,\n  "packages": {\n    "": {\n      "name": "frontend",\n      "version": "%s"\n    }\n  }\n}\n' "$1" "$1" > "$R/frontend/package-lock.json"
  printf '# Changelog\n\n## [Unreleased]\n\n%s\n\n## [%s] - 2026-01-01\n\n- old\n' "$2" "$1" > "$R/CHANGELOG.md"
  ( cd "$R" && git init -q -b main && git config user.name t && git config user.email t@t \
    && git add -A && git commit -q -m init )
}
release() { ( cd "$R" && ./scripts/release.sh "$1" ) >/dev/null 2>&1; }

echo "== minor: 0.21.0 -> 0.22.0"
mkrepo 0.21.0 "- new thing"
if release minor; then
  grep -q '"version": "0.22.0"' "$R/frontend/package.json" && ok "package.json" || bad "package.json не обновлен"
  [ "$(grep -c '"version": "0.22.0"' "$R/frontend/package-lock.json")" = 2 ] && ok "lock: обе версии" || bad "lock не обновлен"
  git -C "$R" rev-parse v0.22.0 >/dev/null 2>&1 && ok "тег v0.22.0" || bad "нет тега"
  [ "$(git -C "$R" log -1 --format=%s)" = "chore(release): v0.22.0" ] && ok "сообщение коммита" || bad "сообщение коммита"
  [ -z "$(git -C "$R" status --porcelain)" ] && ok "дерево чистое" || bad "дерево грязное"
  awk '/^## \[0.22.0\]/{f=1; next} /^## \[/{f=0} f && /^- new thing/{n=1} END{exit !n}' "$R/CHANGELOG.md" \
    && ok "запись переехала под 0.22.0" || bad "запись не под новой версией"
  grep -q '^## \[Unreleased\]' "$R/CHANGELOG.md" && ok "[Unreleased] остался" || bad "потерян [Unreleased]"
else bad "release minor упал"; fi

echo "== patch и major"
mkrepo 0.21.0 "- fix"
release patch && grep -q '"version": "0.21.1"' "$R/frontend/package.json" && ok "patch: 0.21.1" || bad "patch"
mkrepo 0.21.5 "- big"
release major && grep -q '"version": "1.0.0"' "$R/frontend/package.json" && ok "major: 1.0.0 (минор и патч обнулены)" || bad "major"

echo "== отказы"
mkrepo 0.21.0 "- x"; echo dirty > "$R/dirty.txt"
release minor && bad "релиз при грязном дереве" || ok "грязное дерево отклонено"
mkrepo 0.21.0 ""
release minor && bad "релиз с пустым [Unreleased]" || ok "пустой [Unreleased] отклонен"
mkrepo 0.21.0 "- x"
release huge && bad "принят неизвестный уровень" || ok "неизвестный уровень отклонен"
mkrepo 0.21.0 "- x"; git -C "$R" checkout -q -b feature
release minor && bad "релиз не из main" || ok "релиз не из main отклонен"
mkrepo 0.21.0 "- x"; git -C "$R" tag v0.22.0
release minor && bad "существующий тег" || ok "существующий тег отклонен"

echo
if [ "$FAIL" = 0 ]; then echo "ИТОГО: все проверки прошли"; else echo "ИТОГО: есть ошибки" >&2; exit 1; fi
