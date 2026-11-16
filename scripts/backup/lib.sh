#!/usr/bin/env bash
# Общие функции бэкапа Meridian: подключаются из backup.sh, pull-backups.sh и restore-check.sh.
#
# Копия — каталог YYYY-MM-DD_HHMMSS (время сервера) с db.sql.gz, копиями папок данных и meta.txt;
# копией считается только каталог с маркером COMPLETE. Всё, что называется иначе, скрипты не трогают
# (на проде в каталоге бэкапов лежит ручной дамп — он в безопасности).

KEEP_DAILY="${KEEP_DAILY:-14}"
KEEP_WEEKLY="${KEEP_WEEKLY:-8}"
KEEP_MONTHLY="${KEEP_MONTHLY:-6}"
BACKUP_NAME_RE='^[0-9]{4}-[0-9]{2}-[0-9]{2}_[0-9]{6}$'

log() { printf '%s %s\n' "$(date '+%F %T')" "$*"; }
die() { log "ОШИБКА: $1" >&2; exit "${2:-1}"; }

free_kb() { df -Pk "$1" | awk 'NR==2 {print $4}'; }
dir_kb()  { { du -sk "$@" 2>/dev/null || true; } | awk '{s+=$1} END {print s+0}'; }

# «число_файлов байты» для каталога
dir_stats() { find "$1" -type f -printf '%s\n' | awk '{n++; s+=$1} END {printf "%d %d\n", n, s}'; }

# Полные копии каталога, от новой к старой (по одному имени в строке).
list_complete() {
  local dir="$1" p name
  for p in "$dir"/*/; do
    [ -d "$p" ] || continue
    name=$(basename "$p")
    [[ $name =~ $BACKUP_NAME_RE ]] || continue
    [ -f "${p}COMPLETE" ] || continue
    printf '%s\n' "$name"
  done | LC_ALL=C sort -r
}
# sed, а не head: head закрывает канал раньше времени, и pipefail считает это ошибкой
latest_complete() { list_complete "$1" | sed -n '1p'; }

# Какие копии оставить (схема «дедушка-отец-сын» по РАЗНЫМ периодам, в которых есть копии).
# stdin — имена от новой к старой, stdout — оставляемые. По одной (самой свежей) копии на день/неделю/месяц;
# самая свежая копия не удаляется никогда.
keep_set() {
  local kd="$1" kw="$2" km="$3" name day week month keep
  local -A seen_d=() seen_w=() seen_m=()
  local nd=0 nw=0 nm=0 first=1
  while IFS= read -r name; do
    if [ -z "$name" ]; then continue; fi
    day=${name:0:10}; month=${name:0:7}
    week=$(date -d "$day" +%G-W%V)
    keep=0
    if [ "$first" = 1 ]; then keep=1; first=0; fi
    if [ -z "${seen_d[$day]:-}" ] && [ "$nd" -lt "$kd" ]; then seen_d[$day]=1; nd=$((nd+1)); keep=1; fi
    if [ -z "${seen_w[$week]:-}" ] && [ "$nw" -lt "$kw" ]; then seen_w[$week]=1; nw=$((nw+1)); keep=1; fi
    if [ -z "${seen_m[$month]:-}" ] && [ "$nm" -lt "$km" ]; then seen_m[$month]=1; nm=$((nm+1)); keep=1; fi
    if [ "$keep" = 1 ]; then printf '%s\n' "$name"; fi
  done
}

# Удаляет копии вне набора хранения и недостроенные .partial-* старше суток.
# Возвращает 2 на недопустимый каталог, 3 если набор хранения пуст (ошибка — тогда ничего не удаляется).
prune_backups() {
  local dir="${1:-}"
  case "$dir" in /?*) ;; *) log "чистка: нужен абсолютный путь, получено '$dir'" >&2; return 2 ;; esac
  [ -d "$dir" ] || { log "чистка: нет каталога $dir" >&2; return 2; }
  local all keep name removed=0 kept_n=0
  all=$(list_complete "$dir")
  if [ -z "$all" ]; then log "чистка: полных копий нет — ничего не удаляю"; return 0; fi
  keep=$(printf '%s\n' "$all" | keep_set "$KEEP_DAILY" "$KEEP_WEEKLY" "$KEEP_MONTHLY")
  if [ -z "$keep" ]; then log "чистка: набор хранения пуст — ничего не удаляю" >&2; return 3; fi
  local -A kept=()
  while IFS= read -r name; do
    if [ -n "$name" ]; then kept[$name]=1; kept_n=$((kept_n+1)); fi
  done <<< "$keep"
  while IFS= read -r name; do
    if [ -z "$name" ]; then continue; fi
    if [ -z "${kept[$name]:-}" ] && [[ $name =~ $BACKUP_NAME_RE ]]; then
      rm -rf -- "${dir:?}/${name:?}"
      log "удалена устаревшая копия $name"
      removed=$((removed+1))
    fi
  done <<< "$all"
  find "$dir" -maxdepth 1 -name '.partial-*' -mmin +1440 -exec rm -rf -- {} + 2>/dev/null || true
  log "чистка: оставлено $kept_n, удалено $removed"
}

# Проверка целостности копии; 0 — цела, иначе причина в stdout.
verify_backup() {
  local d="$1" line key val want got
  if [ -f "$d/data.tar.age" ]; then
    [ -f "$d/meta.txt" ] || { echo "нет meta.txt"; return 1; }
    [ "$(head -c 21 "$d/data.tar.age")" = "age-encryption.org/v1" ] || { echo "data.tar.age не похож на файл age"; return 1; }
    want=$(sed -n 's/^archive_sha256=//p' "$d/meta.txt")
    got=$(sha256sum "$d/data.tar.age" | awk '{print $1}')
    if [ -z "$want" ] || [ "$want" != "$got" ]; then echo "контрольная сумма архива не совпала"; return 1; fi
    want=$(sed -n 's/^archive_bytes=//p' "$d/meta.txt")
    if [ "$want" != "$(stat -c %s "$d/data.tar.age")" ]; then echo "размер архива не совпал"; return 1; fi
    return 0
  fi
  [ -f "$d/db.sql.gz" ] || { echo "нет db.sql.gz"; return 1; }
  [ -f "$d/meta.txt" ]  || { echo "нет meta.txt"; return 1; }
  gzip -t "$d/db.sql.gz" 2>/dev/null || { echo "db.sql.gz повреждён"; return 1; }
  want=$(sed -n 's/^db_sha256=//p' "$d/meta.txt")
  got=$(sha256sum "$d/db.sql.gz" | awk '{print $1}')
  if [ -z "$want" ] || [ "$want" != "$got" ]; then echo "контрольная сумма дампа не совпала"; return 1; fi
  want=$(sed -n 's/^env_sha256=//p' "$d/meta.txt")
  if [ -n "$want" ]; then
    [ -f "$d/env.backup" ] || { echo "нет env.backup"; return 1; }
    got=$(sha256sum "$d/env.backup" | awk '{print $1}')
    if [ "$got" != "$want" ]; then echo "env.backup изменён"; return 1; fi
  fi
  while IFS= read -r line; do
    key=${line%%=*}; val=${line#*=}
    case "$key" in
      dir.*)
        [ -d "$d/${key#dir.}" ] || { echo "нет каталога ${key#dir.}"; return 1; }
        got=$(dir_stats "$d/${key#dir.}")
        if [ "$got" != "$val" ]; then echo "каталог ${key#dir.}: ожидалось '$val', на диске '$got'"; return 1; fi
        ;;
    esac
  done < "$d/meta.txt"
  return 0
}

# ── шифрование (age) ─────────────────────────────────────────────────────────

is_encrypted_backup() { [ -f "$1/data.tar.age" ]; }

# Заменяет содержимое каталога копии одним зашифрованным архивом data.tar.age (age, публичные ключи из файла
# получателей). Внутри архива — всё, что было (db.sql.gz, env.backup, папки данных, meta.txt); снаружи остаётся
# meta.txt без секретов: имя, хост, время, размер и sha256 архива. Расшифровать может только владелец приватного ключа.
encrypt_backup_dir() {  # encrypt_backup_dir <каталог .partial-*> <файл_получателей> <имя_копии>
  local d="$1" recipients="$2" name="$3" enc_tmp size sha
  case "$d" in */.partial-*) ;; *) log "encrypt: недопустимый каталог '$d'" >&2; return 2 ;; esac
  enc_tmp="${d}.age.tmp"
  tar -C "$d" -cf - . | age -R "$recipients" -o "$enc_tmp"
  size=$(stat -c %s "$enc_tmp")
  sha=$(sha256sum "$enc_tmp" | awk '{print $1}')
  find "$d" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
  mv "$enc_tmp" "$d/data.tar.age"
  {
    echo "name=$name"
    echo "host=$(hostname)"
    echo "created_epoch=$(date +%s)"
    echo "enc=age"
    echo "archive_bytes=$size"
    echo "archive_sha256=$sha"
  } > "$d/meta.txt"
}

# Расшифровывает копию приватным ключом age в пустой каталог.
extract_backup() {  # extract_backup <копия> <файл_ключа> <каталог_назначения>
  local d="$1" key="$2" out="$3"
  age -d -i "$key" "$d/data.tar.age" | tar -x -C "$out"
}

# Удаляет ОТКРЫТЫЕ копии — но только если есть хотя бы одна зашифрованная (иначе остались бы без копий).
drop_plain_backups() {
  local dir="${1:-}" name enc=0 removed=0
  local -a plain=()
  case "$dir" in /?*) ;; *) log "drop-plain: нужен абсолютный путь, получено '$dir'" >&2; return 2 ;; esac
  [ -d "$dir" ] || { log "drop-plain: нет каталога $dir" >&2; return 2; }
  while IFS= read -r name; do
    if [ -z "$name" ]; then continue; fi
    if is_encrypted_backup "$dir/$name"; then enc=$((enc+1)); else plain+=("$name"); fi
  done < <(list_complete "$dir")
  if [ "$enc" -eq 0 ]; then log "drop-plain: зашифрованных копий нет — открытые не трогаю" >&2; return 3; fi
  for name in "${plain[@]:-}"; do
    if [ -z "$name" ]; then continue; fi
    rm -rf -- "${dir:?}/${name:?}"
    log "удалена открытая копия $name"
    removed=$((removed+1))
  done
  log "drop-plain: удалено $removed, зашифрованных осталось $enc"
}

# ── проверка итогов тестового восстановления ─────────────────────────────────

# Осмысленны ли цифры, посчитанные во временной базе. Аргументы: <строк_в_alembic_version> <версия> <строк_в_users>.
# 0 — осмысленны; иначе причина в stdout и код 1. Пустая база или «не удалось посчитать» — это НЕ восстановление.
restore_facts_ok() {
  local a_rows="${1:-}" a_ver="${2:-}" users="${3:-}" v
  for v in "$a_rows" "$users"; do
    [[ $v =~ ^[0-9]+$ ]] || { echo "не удалось посчитать (получено '$v')"; return 1; }
  done
  [ "$a_rows" -eq 1 ] || { echo "в alembic_version строк: $a_rows (ожидалась ровно 1)"; return 1; }
  [ -n "$a_ver" ] || { echo "пустая версия миграции"; return 1; }
  [ "$users" -ge 1 ] || { echo "в users нет ни одной строки: копия пустая"; return 1; }
  return 0
}

# Есть ли в env-файле непустое значение переменной (само значение не печатается).
env_has_value() {  # env_has_value <файл> <ИМЯ>
  local val
  val=$(sed -n "s/^[[:space:]]*\(export[[:space:]]\+\)\{0,1\}$2=//p" "$1" 2>/dev/null | tail -n 1 | tr -d "\"' \r") || true
  [ -n "$val" ]
}

# Свежесть доказательства восстановимости: файл RESTORE_STATUS («OK|FAILED <epoch> <имя>», пишет restore-check.sh).
# restore_proof_state <файл> <now_epoch> <макс_возраст_сек> → печатает ok|missing|failed|stale|bad; код 0 только для ok.
restore_proof_state() {
  local f="$1" now="$2" max="$3" st="" ts="" rest=""
  [ -f "$f" ] || { echo missing; return 1; }
  read -r st ts rest < "$f" || true
  case "$ts" in ''|*[!0-9]*) echo bad; return 1 ;; esac
  case "$st" in
    OK) ;;
    FAILED) echo failed; return 1 ;;
    *) echo bad; return 1 ;;
  esac
  # время из будущего (больше часа) = мусор или сбитые часы, доказательством не считаем
  [ "$ts" -le $((now + 3600)) ] || { echo bad; return 1; }
  [ $((now - ts)) -le "$max" ] || { echo stale; return 1; }
  echo ok
}
