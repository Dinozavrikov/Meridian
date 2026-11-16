#!/usr/bin/env bash
# Релиз: ./scripts/release.sh patch|minor|major
#   patch — исправление, minor — новая функция, major — готовый продукт (1.0.0 и далее).
# Поднимает версию (frontend/package.json и package-lock.json), переносит записи из
# [Unreleased] в CHANGELOG.md под новую версию, делает коммит "chore(release): vX.Y.Z" и тег.
# Ничего не пушит: публикацию владелец делает отдельно.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

LEVEL="${1:-}"
case "$LEVEL" in patch|minor|major) ;; *) echo "Использование: $0 patch|minor|major" >&2; exit 2 ;; esac

[ -z "$(git status --porcelain)" ] || { echo "Рабочее дерево не чистое: сначала закоммить изменения." >&2; exit 1; }
[ "$(git rev-parse --abbrev-ref HEAD)" = "main" ] || { echo "Релиз делается только из ветки main." >&2; exit 1; }

PKG=frontend/package.json
LOCK=frontend/package-lock.json
CUR="$(grep -m1 '"version"' "$PKG" | sed -E 's/.*"version": *"([^"]+)".*/\1/')"
[[ "$CUR" =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)$ ]] || { echo "Не разобрал версию: $CUR" >&2; exit 1; }
MA=${BASH_REMATCH[1]}; MI=${BASH_REMATCH[2]}; PA=${BASH_REMATCH[3]}
case "$LEVEL" in
  major) MA=$((MA + 1)); MI=0; PA=0 ;;
  minor) MI=$((MI + 1)); PA=0 ;;
  patch) PA=$((PA + 1)) ;;
esac
NEW="$MA.$MI.$PA"

if git rev-parse "v$NEW" >/dev/null 2>&1; then echo "Тег v$NEW уже существует." >&2; exit 1; fi
grep -q '^## \[Unreleased\]' CHANGELOG.md || { echo "В CHANGELOG.md нет раздела [Unreleased]." >&2; exit 1; }
awk '/^## \[Unreleased\]/{f=1; next} /^## \[/{f=0} f && /^- /{n++} END{exit n ? 0 : 1}' CHANGELOG.md \
  || { echo "Раздел [Unreleased] пуст: опиши изменения." >&2; exit 1; }

sed -i "0,/\"version\": \"$CUR\"/s//\"version\": \"$NEW\"/" "$PKG"
sed -i "1,12s/\"version\": \"$CUR\"/\"version\": \"$NEW\"/" "$LOCK"
sed -i "s/^## \[Unreleased\]/## [Unreleased]\n\n## [$NEW] - $(date +%F)/" CHANGELOG.md

git add "$PKG" "$LOCK" CHANGELOG.md
git commit -q -m "chore(release): v$NEW"
git tag -a "v$NEW" -m "Meridian v$NEW"
echo "Версия $CUR -> $NEW, тег v$NEW создан."
