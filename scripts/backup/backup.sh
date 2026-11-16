#!/usr/bin/env bash
# Бэкап Meridian: дамп Postgres + папки uploads и attachments. Запуск по cron на проде (см. backend/docs/BACKUP.md).
#   backup.sh          — сделать копию и почистить устаревшие
#   backup.sh --check  — только проверить окружение (инструменты, пути, место)
# Настройки — переменными окружения (значения по умолчанию — для прода).
# Коды выхода: 0 ок; 1 ошибка; 3 мало места; 4 уже выполняется; 5 дамп не прошёл проверку.
set -euo pipefail
umask 077
SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
. "$SELF_DIR/lib.sh"

_HOME="${HOME:-$(getent passwd "$(id -u)" | cut -d: -f6)}"
MERIDIAN_DIR="${MERIDIAN_DIR:-$_HOME/meridian-web}"
BACKUP_DIR="${BACKUP_DIR:-$_HOME/meridian-backups}"
DATA_DIRS="${DATA_DIRS:-backend/uploads backend/attachments}"
MIN_FREE_MB="${MIN_FREE_MB:-1024}"
BACKUP_ENCRYPT="${BACKUP_ENCRYPT:-1}"      # шифрование включено по умолчанию; 0 — только для тестов
AGE_RECIPIENT_FILE="${AGE_RECIPIENT_FILE:-$SELF_DIR/age-recipient.pub}"
LOG_MAX_LINES=2000
LOG_KEEP_LINES=1000

case "$BACKUP_DIR" in /?*) ;; *) echo "BACKUP_DIR должен быть абсолютным путём" >&2; exit 1 ;; esac

OK=0; LOCKED=0; TMP=""

need() { command -v "$1" >/dev/null 2>&1 || die "не найден инструмент: $1"; }

preflight() {
  local c rel
  for c in rsync gzip flock df du find sha256sum awk stat; do need "$c"; done
  date -d "2026-01-02" +%G-W%V >/dev/null 2>&1 || die "нужен GNU date (date -d)"
  if [ -z "${PG_DUMP_CMD:-}" ]; then
    need docker
    [ -f "$MERIDIAN_DIR/docker-compose.yml" ] || die "нет $MERIDIAN_DIR/docker-compose.yml"
  fi
  for rel in $DATA_DIRS; do
    [ -d "$MERIDIAN_DIR/$rel" ] || log "предупреждение: нет каталога $MERIDIAN_DIR/$rel (будет пропущен)"
  done
  if [ "${BACKUP_ENV:-1}" = 1 ] && [ ! -f "$MERIDIAN_DIR/.env" ]; then
    log "предупреждение: нет $MERIDIAN_DIR/.env — в копию он не попадёт"
  fi
  if [ "$BACKUP_ENCRYPT" = 1 ]; then
    need age
    [ -s "$AGE_RECIPIENT_FILE" ] || die "нет файла получателя шифрования: $AGE_RECIPIENT_FILE (создайте ключ — см. backend/docs/BACKUP.md; без шифрования — BACKUP_ENCRYPT=0)"
    grep -q '^age1' "$AGE_RECIPIENT_FILE" || die "в $AGE_RECIPIENT_FILE нет публичного ключа age (строка age1...)"
  fi
}

check_space() {
  local rel need_kb have_kb dirs=()
  for rel in $DATA_DIRS; do
    if [ -d "$MERIDIAN_DIR/$rel" ]; then dirs+=("$MERIDIAN_DIR/$rel"); fi
  done
  local factor=1
  if [ "$BACKUP_ENCRYPT" = 1 ]; then factor=2; fi      # временная открытая копия + архив
  need_kb=$(( $(dir_kb "${dirs[@]:-}") * factor + MIN_FREE_MB * 1024 ))
  have_kb=$(free_kb "$BACKUP_DIR")
  if [ "$have_kb" -lt "$need_kb" ]; then
    die "мало места в $BACKUP_DIR: свободно ${have_kb} КБ, нужно ${need_kb} КБ (данные + ${MIN_FREE_MB} МБ запаса)" 3
  fi
}

write_status() {
  printf '%s %s %s\n' "$1" "$(date +%s)" "$2" > "$BACKUP_DIR/LAST_STATUS.tmp"
  mv -f "$BACKUP_DIR/LAST_STATUS.tmp" "$BACKUP_DIR/LAST_STATUS"
}

on_exit() {
  local rc=$?
  [ "$LOCKED" = 1 ] || return 0
  if [ "$OK" != 1 ]; then
    case "$TMP" in "$BACKUP_DIR"/.partial-*) rm -rf -- "$TMP" "$TMP.age.tmp" ;; esac
    write_status FAILED "exit=$rc" || true
    log "копия НЕ создана (код $rc)" || true
  fi
}
trap on_exit EXIT

if [ "${1:-}" = "--check" ]; then
  preflight
  mkdir -p "$BACKUP_DIR"
  [ -w "$BACKUP_DIR" ] || die "нет доступа на запись: $BACKUP_DIR"
  echo "OK: окружение готово (свободно $(( $(free_kb "$BACKUP_DIR") / 1024 )) МБ в $BACKUP_DIR)"
  exit 0
fi

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
exec 9>"$BACKUP_DIR/.lock"
flock -n 9 || { echo "$(date '+%F %T') ОШИБКА: другая копия уже выполняется" >&2; exit 4; }
LOCKED=1

LOG="$BACKUP_DIR/backup.log"
if [ -f "$LOG" ] && [ "$(wc -l < "$LOG")" -gt "$LOG_MAX_LINES" ]; then
  tail -n "$LOG_KEEP_LINES" "$LOG" > "$LOG.tmp" && mv -f "$LOG.tmp" "$LOG"
fi
if [ -t 1 ]; then exec > >(tee -a "$LOG") 2>&1; else exec >> "$LOG" 2>&1; fi

preflight
check_space

NAME="${BACKUP_NAME:-$(date +%Y-%m-%d_%H%M%S)}"
[[ $NAME =~ $BACKUP_NAME_RE ]] || die "недопустимое имя копии: $NAME"
[ ! -e "$BACKUP_DIR/$NAME" ] || die "копия $NAME уже существует"
TMP="$BACKUP_DIR/.partial-$NAME"
rm -rf -- "$TMP"
mkdir -p "$TMP"
log "начало: $NAME"

run_dump() {
  if [ -n "${PG_DUMP_CMD:-}" ]; then bash -c "$PG_DUMP_CMD"; return; fi
  ( cd "$MERIDIAN_DIR" && docker compose -f docker-compose.yml exec -T postgres \
      sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-acl' < /dev/null )
}
run_dump | gzip -c > "$TMP/db.sql.gz"
first_line=$(gzip -dc "$TMP/db.sql.gz" | sed -n '1p')
[[ $first_line == --* ]] || die "дамп должен начинаться с комментария pg_dump, а начинается с: ${first_line:0:80}" 5
tail_txt=$(gzip -dc "$TMP/db.sql.gz" | tail -n 5)
[[ $tail_txt == *"PostgreSQL database dump complete"* ]] || die "дамп неполный: нет завершающей строки pg_dump" 5

PREV=$(latest_complete "$BACKUP_DIR")
for rel in $DATA_DIRS; do
  src="$MERIDIAN_DIR/$rel"; base=$(basename "$rel"); dest="$TMP/$base"
  if [ ! -d "$src" ]; then log "нет $src — пропущено"; mkdir -p "$dest"; continue; fi
  args=(-a)
  if [ -n "$PREV" ] && [ -d "$BACKUP_DIR/$PREV/$base" ]; then args+=("--link-dest=$BACKUP_DIR/$PREV/$base"); fi
  rc=0
  rsync "${args[@]}" "$src/" "$dest/" || rc=$?
  # 24 — файлы исчезли во время копирования (нормально для живого каталога)
  if [ "$rc" -ne 0 ] && [ "$rc" -ne 24 ]; then die "rsync $rel завершился с кодом $rc"; fi
done

if [ "${BACKUP_ENV:-1}" = 1 ]; then
  if [ -f "$MERIDIAN_DIR/.env" ]; then
    cp -p "$MERIDIAN_DIR/.env" "$TMP/env.backup"
    chmod 600 "$TMP/env.backup"
  else
    log "предупреждение: нет $MERIDIAN_DIR/.env — в копию он не попал"
  fi
fi

{
  echo "name=$NAME"
  echo "host=$(hostname)"
  echo "created_epoch=$(date +%s)"
  echo "db_bytes=$(stat -c %s "$TMP/db.sql.gz")"
  echo "db_sha256=$(sha256sum "$TMP/db.sql.gz" | awk '{print $1}')"
  if [ -f "$TMP/env.backup" ]; then echo "env_sha256=$(sha256sum "$TMP/env.backup" | awk '{print $1}')"; fi
  for rel in $DATA_DIRS; do
    base=$(basename "$rel")
    echo "dir.$base=$(dir_stats "$TMP/$base")"
  done
} > "$TMP/meta.txt"

reason=$(verify_backup "$TMP") || die "проверка собранной копии не прошла: $reason"
if [ "$BACKUP_ENCRYPT" = 1 ]; then
  encrypt_backup_dir "$TMP" "$AGE_RECIPIENT_FILE" "$NAME"
  reason=$(verify_backup "$TMP") || die "проверка зашифрованной копии не прошла: $reason"
fi
date +%s > "$TMP/COMPLETE"
mv "$TMP" "$BACKUP_DIR/$NAME"
TMP=""
OK=1
write_status OK "$NAME"
log "готово: $NAME"
prune_backups "$BACKUP_DIR" || log "предупреждение: чистка устаревших копий не удалась (код $?)"
