#!/usr/bin/env bash
# Удаляет ОТКРЫТЫЕ (не зашифрованные) копии — только если есть хотя бы одна зашифрованная.
# Использование: drop-plain.sh <каталог_копий>   (на проде: каталог BACKUP_DIR, на резервной машине: ~/meridian-backups/prod)
set -euo pipefail
SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
. "$SELF_DIR/lib.sh"
[ -n "${1:-}" ] || die "укажите каталог копий"
drop_plain_backups "$1"
