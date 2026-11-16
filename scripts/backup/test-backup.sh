#!/usr/bin/env bash
# Тесты бэкапа на временных каталогах и фальшивых датах: прод, docker и сеть не нужны.
# Запуск: scripts/backup/test-backup.sh   (код выхода ≠ 0, если что-то упало)
set -uo pipefail
# Тесты не читают stdin вызывающего: иначе docker/psql внутри съедают скрипт, запущенный через bash -s (тихий обрыв с кодом 0).
exec </dev/null
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$HERE"
PASS=0; FAIL=0; SKIP=0
export INDEX_CHECK=0   # тесты не ходят на прод; проверку индексов включают явно (ic_pull)
export RESTORE_PROOF_CHECK=0
ok()  { PASS=$((PASS+1)); }
bad() { FAIL=$((FAIL+1)); echo "  ПРОВАЛ: $*"; }
eq()  { if [ "$2" = "$3" ]; then ok; else bad "$1: ожидалось '$3', получено '$2'"; fi; }
ne()  { if [ "$2" != "$3" ]; then ok; else bad "$1: значения не должны совпадать ('$2')"; fi; }
expect_ok()   { local d="$1"; shift; if "$@" >/dev/null 2>&1; then ok; else bad "$d (команда упала)"; fi; }
expect_fail() { local d="$1"; shift; if "$@" >/dev/null 2>&1; then bad "$d (команда не должна была пройти)"; else ok; fi; }
section() { echo "== $*"; }
TMPS=()
trap 'rm -rf "${TMPS[@]}"; [ -z "${IC_CONTAINER:-}" ] || docker rm -f "$IC_CONTAINER" >/dev/null 2>&1' EXIT

new_env() {
  T=$(mktemp -d); TMPS+=("$T")
  export MERIDIAN_DIR="$T/app" BACKUP_DIR="$T/backups"
  mkdir -p "$MERIDIAN_DIR/backend/uploads" "$MERIDIAN_DIR/backend/attachments"
  echo "avatar"  > "$MERIDIAN_DIR/backend/uploads/a.txt"
  echo "stable"  > "$MERIDIAN_DIR/backend/attachments/stable.txt"
  echo "v1"      > "$MERIDIAN_DIR/backend/attachments/changing.txt"
  echo "aa" > "$MERIDIAN_DIR/backend/attachments/sized.txt"
  echo "SECRET=1" > "$MERIDIAN_DIR/.env"
  printf -- '-- fake pg_dump\nCREATE TABLE t (id int);\n-- PostgreSQL database dump complete\n' > "$T/fake.sql"
  export PG_DUMP_CMD="cat $T/fake.sql"
  unset BACKUP_NAME MIN_FREE_MB AGE_RECIPIENT_FILE || true
  export BACKUP_ENCRYPT=0      # основные тесты — в режиме без шифрования; шифрование — отдельный раздел ниже
}
backup() { BACKUP_NAME="$1" "$HERE/backup.sh" >/dev/null 2>&1; }
inode()  { stat -c %i "$1"; }
# другое время изменения: rsync сверяет размер и время с точностью до секунды
bump_file() { printf '%s\n' "$2" > "$1"; touch -d "@$(( $(date +%s) + 5 ))" "$1"; }
status_word() { cut -d' ' -f1 "$1" 2>/dev/null; }
dated_dirs() { ls -A "$1" 2>/dev/null | grep -E '^[0-9]{4}-[0-9]{2}-[0-9]{2}_[0-9]{6}$' || true; }

# ── копия ────────────────────────────────────────────────────────────────────
section "создание копии"
new_env
backup 2026-10-01_033000; rc=$?
eq "код выхода" "$rc" 0
B1="$BACKUP_DIR/2026-10-01_033000"
expect_ok "COMPLETE" test -f "$B1/COMPLETE"
expect_ok "meta.txt" test -f "$B1/meta.txt"
eq "содержимое дампа" "$(gzip -dc "$B1/db.sql.gz")" "$(cat "$T/fake.sql")"
eq "файл uploads" "$(cat "$B1/uploads/a.txt")" "avatar"
eq "файл attachments" "$(cat "$B1/attachments/stable.txt")" "stable"
eq "права каталога копии" "$(stat -c %a "$B1")" "700"
eq "права каталога бэкапов" "$(stat -c %a "$BACKUP_DIR")" "700"
eq ".env скопирован" "$(cat "$B1/env.backup")" "SECRET=1"
eq "права копии .env" "$(stat -c %a "$B1/env.backup")" "600"
eq "статус" "$(status_word "$BACKUP_DIR/LAST_STATUS")" "OK"
eq "нет недостроенных" "$(ls -A "$BACKUP_DIR" | grep -c '^\.partial' || true)" "0"
grep -q '^dir.uploads=1 ' "$B1/meta.txt" && ok || bad "meta.txt: счётчик uploads"
expect_ok "verify_backup" bash -c ". '$HERE/lib.sh'; verify_backup '$B1'"

section "жёсткие ссылки: неизменённые файлы общие, изменённые — нет, удаление старой копии безопасно"
bump_file "$MERIDIAN_DIR/backend/attachments/changing.txt" v2
echo "bbbb" > "$MERIDIAN_DIR/backend/attachments/sized.txt"      # другой размер: заметен и без смены времени
backup 2026-10-02_033000
B2="$BACKUP_DIR/2026-10-02_033000"
ne "sized.txt (другой размер) — разные inode" "$(inode "$B2/attachments/sized.txt")" "$(inode "$B1/attachments/sized.txt")"
eq "sized.txt — новое содержимое" "$(cat "$B2/attachments/sized.txt")" "bbbb"
eq "sized.txt — старое содержимое" "$(cat "$B1/attachments/sized.txt")" "aa"
eq "stable.txt — один inode" "$(inode "$B2/attachments/stable.txt")" "$(inode "$B1/attachments/stable.txt")"
ne "changing.txt — разные inode" "$(inode "$B2/attachments/changing.txt")" "$(inode "$B1/attachments/changing.txt")"
eq "старая версия цела" "$(cat "$B1/attachments/changing.txt")" "v1"
eq "новая версия" "$(cat "$B2/attachments/changing.txt")" "v2"
rm -rf "$B1"
eq "после удаления старой копии новая читается" "$(cat "$B2/attachments/stable.txt")" "stable"

section "сбои не оставляют следов и не трогают прежние копии"
before=$(dated_dirs "$BACKUP_DIR")
PG_DUMP_CMD='echo "-- partial"; exit 1' backup 2026-10-03_033000; rc=$?
ne "упавший pg_dump → ошибка" "$rc" 0
eq "статус FAILED" "$(status_word "$BACKUP_DIR/LAST_STATUS")" "FAILED"
eq "список копий не изменился" "$(dated_dirs "$BACKUP_DIR")" "$before"
eq "нет .partial" "$(ls -A "$BACKUP_DIR" | grep -c '^\.partial' || true)" "0"
PG_DUMP_CMD='echo "-- truncated"; echo "CREATE TABLE t (id int);"' backup 2026-10-03_033000; rc=$?
eq "обрезанный дамп → код 5" "$rc" 5
PG_DUMP_CMD='echo "time=now level=warning msg=junk"; cat '"$T/fake.sql" backup 2026-10-03_033000; rc=$?
eq "мусор перед дампом → код 5" "$rc" 5
eq "список копий по-прежнему тот же" "$(dated_dirs "$BACKUP_DIR")" "$before"
backup 2026-10-04_033000; rc=$?
eq "после сбоев копия снова создаётся" "$rc" 0
eq "статус снова OK" "$(status_word "$BACKUP_DIR/LAST_STATUS")" "OK"

section "место, блокировка, проверка окружения, имя"
new_env
MIN_FREE_MB=999999999 backup 2026-10-01_033000; rc=$?
eq "мало места → код 3" "$rc" 3
eq "каталог копии не создан" "$(dated_dirs "$BACKUP_DIR")" ""
new_env
mkdir -p "$BACKUP_DIR"
( flock 9; sleep 3 ) 9>"$BACKUP_DIR/.lock" &
HOLDER=$!
sleep 0.5
backup 2026-10-01_033000; rc=$?
eq "уже выполняется → код 4" "$rc" 4
eq "статус не перезаписан" "$([ -f "$BACKUP_DIR/LAST_STATUS" ] && echo есть || echo нет)" "нет"
wait "$HOLDER"
backup 2026-10-01_033000; rc=$?
eq "после освобождения блокировки" "$rc" 0
expect_ok "--check" "$HERE/backup.sh" --check
BACKUP_NAME="плохое имя" "$HERE/backup.sh" >/dev/null 2>&1; rc=$?
ne "недопустимое имя отклонено" "$rc" 0
backup 2026-10-01_033000; rc=$?
ne "повтор имени отклонён" "$rc" 0
eq "первая копия не повреждена" "$(gzip -dc "$BACKUP_DIR/2026-10-01_033000/db.sql.gz" | wc -l)" "3"

# ── проверка целостности ─────────────────────────────────────────────────────
section "verify_backup ловит порчу"
new_env
backup 2026-10-01_033000
V="$BACKUP_DIR/2026-10-01_033000"
expect_ok "цела" bash -c ". '$HERE/lib.sh'; verify_backup '$V'"
echo "лишнее" > "$V/uploads/new.txt"
expect_fail "лишний файл" bash -c ". '$HERE/lib.sh'; verify_backup '$V'"
rm "$V/uploads/new.txt"
rm "$V/attachments/stable.txt"
expect_fail "пропавший файл" bash -c ". '$HERE/lib.sh'; verify_backup '$V'"
echo "stable" > "$V/attachments/stable.txt"
expect_ok "восстановлен" bash -c ". '$HERE/lib.sh'; verify_backup '$V'"
echo "SECRET=2" > "$V/env.backup"
expect_fail "изменённая копия .env" bash -c ". '$HERE/lib.sh'; verify_backup '$V'"
echo "SECRET=1" > "$V/env.backup"
expect_ok "копия .env восстановлена" bash -c ". '$HERE/lib.sh'; verify_backup '$V'"
printf 'xx' >> "$V/db.sql.gz"
expect_fail "порченый дамп" bash -c ". '$HERE/lib.sh'; verify_backup '$V'"

# ── хранение ─────────────────────────────────────────────────────────────────
section "автоудаление: набор хранения совпадает с независимым расчётом на Python"
new_env
B="$T/retention"
mkdir -p "$B"
names=()
for i in $(seq 0 399); do
  if [ "$i" -ge 100 ] && [ "$i" -le 130 ]; then continue; fi          # «компьютер был выключен месяц»
  day=$(date -d "2026-10-04 - $i days" +%F)
  names+=("${day}_033000")
  if [ $((i % 5)) -eq 0 ]; then names+=("${day}_151500"); fi            # две копии за день
done
for n in "${names[@]}"; do mkdir -p "$B/$n"; echo 1 > "$B/$n/COMPLETE"; done
echo "ручной дамп" > "$B/pre-key-rotation-20260929-091658.sql"
echo "заметка" > "$B/notes.txt"
mkdir -p "$B/random-dir" "$B/.partial-2026-01-01_000000" "$B/.partial-2026-10-05_000000"
touch -d '3 days ago' "$B/.partial-2026-01-01_000000"

oracle() {  # oracle KD KW KM  (имена на stdin)
  python3 -c '
import sys, datetime as dt
kd, kw, km = map(int, sys.argv[1:4])
names = sorted(sys.stdin.read().split(), reverse=True)
keep = {names[0]}
def pick(keyf, n):
    seen = []
    for nm in names:
        k = keyf(nm)
        if k not in seen and len(seen) < n:
            seen.append(k); keep.add(nm)
pick(lambda nm: nm[:10], kd)
pick(lambda nm: dt.date.fromisoformat(nm[:10]).isocalendar()[:2], kw)
pick(lambda nm: nm[:7], km)
print("\n".join(sorted(keep)))
' "$@"
}
prune() { ( KEEP_DAILY=$2 KEEP_WEEKLY=$3 KEEP_MONTHLY=$4; . "$HERE/lib.sh"; prune_backups "$1" ) >/dev/null 2>&1; }
remaining() { ( cd "$1" && for d in */; do if [ -f "$d/COMPLETE" ]; then echo "${d%/}"; fi; done | LC_ALL=C sort ); }

expected=$(printf '%s\n' "${names[@]}" | oracle 14 8 6)
prune "$B" 14 8 6
actual=$(remaining "$B")
eq "оставшиеся копии" "$actual" "$expected"
count=$(printf '%s\n' "$actual" | wc -l)
if [ "$count" -ge 14 ] && [ "$count" -le 28 ]; then ok; else bad "число оставшихся ($count) вне разумных границ 14..28"; fi
expect_ok "самая свежая жива" test -d "$B/2026-10-04_151500"
expect_ok "ручной дамп цел" test -f "$B/pre-key-rotation-20260929-091658.sql"
expect_ok "чужой файл цел" test -f "$B/notes.txt"
expect_ok "чужой каталог цел" test -d "$B/random-dir"
expect_fail "старый .partial удалён" test -e "$B/.partial-2026-01-01_000000"
expect_ok "свежий .partial цел" test -d "$B/.partial-2026-10-05_000000"
prune "$B" 14 8 6
eq "повторная чистка ничего не меняет" "$(remaining "$B")" "$expected"

section "автоудаление: границы"
B2="$T/edge"; mkdir -p "$B2/2000-01-01_000000"; echo 1 > "$B2/2000-01-01_000000/COMPLETE"
prune "$B2" 0 0 0
expect_ok "единственная копия не удаляется" test -d "$B2/2000-01-01_000000"
B3="$T/zero"; mkdir -p "$B3"
for d in 2026-10-01 2026-10-02 2026-10-03; do mkdir -p "$B3/${d}_033000"; echo 1 > "$B3/${d}_033000/COMPLETE"; done
prune "$B3" 0 0 0
eq "при нулевых лимитах остаётся только самая свежая" "$(remaining "$B3")" "2026-10-03_033000"
B4="$T/empty"; mkdir -p "$B4"
expect_ok "пустой каталог — не ошибка" bash -c ". '$HERE/lib.sh'; prune_backups '$B4'"
expect_fail "корень отклонён" bash -c ". '$HERE/lib.sh'; prune_backups /"
expect_fail "пустой путь отклонён" bash -c ". '$HERE/lib.sh'; prune_backups ''"
expect_fail "относительный путь отклонён" bash -c ". '$HERE/lib.sh'; prune_backups relative/dir"
expect_fail "несуществующий каталог отклонён" bash -c ". '$HERE/lib.sh'; prune_backups /нет/такого/каталога"

# ── забор на второй компьютер ────────────────────────────────────────────────
section "pull: копирует, проверяет, хранит по своей схеме"
new_env
PROD="$BACKUP_DIR"; MIRROR="$T/mirror"
backup 2026-09-30_033000
bump_file "$MERIDIAN_DIR/backend/attachments/changing.txt" v2
backup 2026-10-01_033000
backup 2026-10-02_033000
mkdir -p "$PROD/.partial-2026-10-03_033000"; echo "x" > "$PROD/.partial-2026-10-03_033000/db.sql.gz"
echo "ручной" > "$PROD/pre-key-rotation.sql"
pull() { PULL_SRC="$PROD" LOCAL_DIR="$MIRROR" "$HERE/pull-backups.sh" >/dev/null 2>&1; }
pull; rc=$?
eq "pull: код выхода" "$rc" 0
eq "pull: три копии" "$(dated_dirs "$MIRROR" | wc -l)" "3"
for d in 2026-09-30_033000 2026-10-01_033000 2026-10-02_033000; do expect_ok "pull: COMPLETE у $d" test -f "$MIRROR/$d/COMPLETE"; done
expect_fail "pull: .partial не забран" test -e "$MIRROR/.partial-2026-10-03_033000"
expect_fail "pull: чужие файлы не забраны" test -e "$MIRROR/pre-key-rotation.sql"
eq "pull: статус" "$(status_word "$MIRROR/STATUS")" "OK"
eq "pull: жёсткие ссылки сохранены" "$(inode "$MIRROR/2026-10-01_033000/attachments/stable.txt")" "$(inode "$MIRROR/2026-10-02_033000/attachments/stable.txt")"
eq "pull: старая версия файла" "$(cat "$MIRROR/2026-09-30_033000/attachments/changing.txt")" "v1"
eq "pull: новая версия файла" "$(cat "$MIRROR/2026-10-01_033000/attachments/changing.txt")" "v2"
eq "pull: права" "$(stat -c %a "$MIRROR")" "700"
pull; eq "pull: повторный запуск" "$?" 0
rm -rf "$PROD/2026-09-30_033000"
pull; eq "pull: удаление на проде" "$?" 0
expect_ok "pull: локальная копия пережила удаление на проде" test -f "$MIRROR/2026-09-30_033000/COMPLETE"

section "pull: порча на проде, устаревшая и FAILED копия, недоступный прод"
backup 2026-10-03_033000
printf 'xx' >> "$PROD/2026-10-03_033000/db.sql.gz"
pull; rc=$?
eq "pull: порченая копия → код 6" "$rc" 6
expect_fail "pull: порченая копия не помечена COMPLETE" test -f "$MIRROR/2026-10-03_033000/COMPLETE"
eq "pull: статус PROBLEMS" "$(status_word "$MIRROR/STATUS")" "PROBLEMS"
expect_ok "pull: прежние копии целы" test -f "$MIRROR/2026-10-02_033000/COMPLETE"

new_env
PROD="$BACKUP_DIR"; MIRROR="$T/mirror"
backup 2026-10-01_033000
pull; eq "pull: свежая копия — порядок" "$?" 0
printf 'OK 1000000000 2026-10-01_033000\n' > "$PROD/LAST_STATUS"
pull; eq "pull: устаревшая копия → код 6" "$?" 6
printf 'FAILED %s exit=1\n' "$(date +%s)" > "$PROD/LAST_STATUS"
pull; eq "pull: FAILED на проде → код 6" "$?" 6
PULL_SRC="$T/нет-такого-каталога" LOCAL_DIR="$MIRROR" "$HERE/pull-backups.sh" >/dev/null 2>&1; rc=$?
eq "pull: прод недоступен → код 6" "$rc" 6
expect_ok "pull: локальные копии при этом целы" test -f "$MIRROR/2026-10-01_033000/COMPLETE"

echo
section ".env: отключается, доезжает до второго компьютера, его отсутствие не ломает копию"
new_env
BACKUP_ENV=0 backup 2026-10-01_033000
expect_fail "BACKUP_ENV=0: копии .env нет" test -e "$BACKUP_DIR/2026-10-01_033000/env.backup"
expect_ok "BACKUP_ENV=0: копия при этом полная" test -f "$BACKUP_DIR/2026-10-01_033000/COMPLETE"
new_env
PROD="$BACKUP_DIR"; MIRROR="$T/mirror"
backup 2026-10-01_033000
pull; eq "pull с .env" "$?" 0
eq "pull: .env доехал" "$(cat "$MIRROR/2026-10-01_033000/env.backup")" "SECRET=1"
eq "pull: права .env" "$(stat -c %a "$MIRROR/2026-10-01_033000/env.backup")" "600"
rm -f "$MERIDIAN_DIR/.env"
backup 2026-10-02_033000; rc=$?
eq "нет .env — копия всё равно создаётся" "$rc" 0
expect_fail "нет .env — нет env.backup" test -e "$BACKUP_DIR/2026-10-02_033000/env.backup"
section "шифрование: age, публичный ключ на проде, приватный остаётся у владельца"
if ! command -v age >/dev/null 2>&1 || ! command -v age-keygen >/dev/null 2>&1; then
  bad "не установлен age (sudo apt-get install age): тесты шифрования не выполнены"
else
  make_keys() {
    age-keygen -o "$T/key.txt" >/dev/null 2>&1
    age-keygen -y "$T/key.txt" > "$T/recipient.pub"
    age-keygen -o "$T/other-key.txt" >/dev/null 2>&1
  }
  enc_backup() { BACKUP_ENCRYPT=1 AGE_RECIPIENT_FILE="$T/recipient.pub" BACKUP_NAME="$1" "$HERE/backup.sh" >/dev/null 2>&1; }

  new_env; make_keys
  enc_backup 2026-10-01_033000; rc=$?
  eq "шифрованная копия: код выхода" "$rc" 0
  E="$BACKUP_DIR/2026-10-01_033000"
  eq "в каталоге копии только архив, метаданные и маркер" "$(ls -A "$E" | LC_ALL=C sort | tr '\n' ' ')" "COMPLETE data.tar.age meta.txt "
  eq "в архиве нет открытого .env" "$(grep -c 'SECRET=1' "$E/data.tar.age" || true)" "0"
  eq "в архиве нет открытого содержимого файла" "$(grep -c 'avatar' "$E/data.tar.age" || true)" "0"
  eq "в meta.txt нет секретов" "$(grep -c 'SECRET' "$E/meta.txt" || true)" "0"
  eq "заголовок age" "$(head -c 21 "$E/data.tar.age")" "age-encryption.org/v1"
  eq "права архива" "$(stat -c %a "$E/data.tar.age")" "600"
  eq "нет недостроенных и временных файлов" "$(ls -A "$BACKUP_DIR" | grep -c '^\.partial' || true)" "0"
  expect_ok "verify без ключа" bash -c ". '$HERE/lib.sh'; verify_backup '$E'"

  X="$T/extracted"; mkdir -p "$X"; chmod 700 "$X"
  expect_ok "расшифровка своим ключом" bash -c ". '$HERE/lib.sh'; extract_backup '$E' '$T/key.txt' '$X'"
  eq "расшифровано: .env" "$(cat "$X/env.backup" 2>/dev/null)" "SECRET=1"
  eq "расшифровано: файл" "$(cat "$X/uploads/a.txt" 2>/dev/null)" "avatar"
  eq "расшифровано: дамп" "$(gzip -dc "$X/db.sql.gz" 2>/dev/null)" "$(cat "$T/fake.sql")"
  expect_ok "расшифрованное проходит verify_backup" bash -c ". '$HERE/lib.sh'; verify_backup '$X'"
  Y="$T/extracted-wrong"; mkdir -p "$Y"
  expect_fail "чужим ключом не расшифровать" bash -c ". '$HERE/lib.sh'; extract_backup '$E' '$T/other-key.txt' '$Y'"

  cp -a "$E" "$T/tamper1"; printf 'x' >> "$T/tamper1/data.tar.age"
  expect_fail "дописанный байт виден без ключа" bash -c ". '$HERE/lib.sh'; verify_backup '$T/tamper1'"
  cp -a "$E" "$T/tamper2"; echo "это не age" > "$T/tamper2/data.tar.age"
  expect_fail "подмена архива видна без ключа" bash -c ". '$HERE/lib.sh'; verify_backup '$T/tamper2'"

  before=$(dated_dirs "$BACKUP_DIR")
  BACKUP_ENCRYPT=1 AGE_RECIPIENT_FILE="$T/нет-файла.pub" BACKUP_NAME=2026-10-02_033000 "$HERE/backup.sh" >/dev/null 2>&1; rc=$?
  ne "нет файла получателя — ошибка, а не открытая копия" "$rc" 0
  echo "это не ключ" > "$T/bad.pub"
  BACKUP_ENCRYPT=1 AGE_RECIPIENT_FILE="$T/bad.pub" BACKUP_NAME=2026-10-02_033000 "$HERE/backup.sh" >/dev/null 2>&1; rc=$?
  ne "мусор вместо ключа — ошибка" "$rc" 0
  eq "новых копий не появилось" "$(dated_dirs "$BACKUP_DIR")" "$before"
  eq "статус FAILED" "$(status_word "$BACKUP_DIR/LAST_STATUS")" "FAILED"

  enc_backup 2026-10-03_033000
  PROD="$BACKUP_DIR"; MIRROR="$T/mirror"
  pull; rc=$?
  eq "pull зашифрованных копий (ключ не нужен)" "$rc" 0
  expect_ok "pull: архив доехал" test -f "$MIRROR/2026-10-03_033000/data.tar.age"
  expect_ok "pull: копия помечена COMPLETE" test -f "$MIRROR/2026-10-03_033000/COMPLETE"
  enc_backup 2026-10-04_033000
  printf 'x' >> "$PROD/2026-10-04_033000/data.tar.age"
  pull; rc=$?
  eq "pull: порченый архив на проде → код 6" "$rc" 6
  expect_fail "pull: порченый архив не помечен COMPLETE" test -f "$MIRROR/2026-10-04_033000/COMPLETE"

  new_env; make_keys
  backup 2026-10-01_033000
  echo "чужое" > "$BACKUP_DIR/notes.txt"
  "$HERE/drop-plain.sh" "$BACKUP_DIR" >/dev/null 2>&1; rc=$?
  ne "drop-plain: только открытые копии — отказ" "$rc" 0
  expect_ok "drop-plain: открытая копия цела" test -f "$BACKUP_DIR/2026-10-01_033000/COMPLETE"
  enc_backup 2026-10-02_033000
  "$HERE/drop-plain.sh" "$BACKUP_DIR" >/dev/null 2>&1; rc=$?
  eq "drop-plain: код" "$rc" 0
  expect_fail "drop-plain: открытая копия удалена" test -e "$BACKUP_DIR/2026-10-01_033000"
  expect_ok "drop-plain: зашифрованная жива" test -f "$BACKUP_DIR/2026-10-02_033000/COMPLETE"
  expect_ok "drop-plain: чужой файл цел" test -f "$BACKUP_DIR/notes.txt"
fi


# ── итоги восстановления: функции ────────────────────────────────────────────
section "restore_facts_ok и env_has_value"
facts() { bash -c ". '$HERE/lib.sh'; restore_facts_ok \"\$@\"" _ "$@"; }
expect_ok   "осмысленные цифры" facts 1 abc123 5
expect_fail "«нет данных» вместо числа" facts "нет данных" abc123 5
expect_fail "пустая users" facts 1 abc123 0
expect_fail "две строки в alembic_version" facts 2 abc123 5
expect_fail "пустая версия миграции" facts 1 "" 5
expect_fail "пусто вместо users" facts 1 abc123 ""
EF="$(mktemp -d)/e.env"; TMPS+=("$(dirname "$EF")")
printf 'A=1\nEMPTY=\nQ="quoted"\nEMPTYQ=""\nexport EXP=x\n  SP=y\n#C=z\n' > "$EF"
envf() { bash -c ". '$HERE/lib.sh'; env_has_value \"\$1\" \"\$2\"" _ "$@"; }
expect_ok   "env: обычное значение" envf "$EF" A
expect_fail "env: пустое значение" envf "$EF" EMPTY
expect_ok   "env: значение в кавычках" envf "$EF" Q
expect_fail "env: пустые кавычки" envf "$EF" EMPTYQ
expect_ok   "env: export" envf "$EF" EXP
expect_ok   "env: с отступом" envf "$EF" SP
expect_fail "env: закомментированная" envf "$EF" C
expect_fail "env: нет переменной" envf "$EF" NOPE
expect_fail "env: нет файла" envf "$EF.нет" A

# ── restore-check: настоящее восстановление ──────────────────────────────────
section "restore-check: настоящий временный Postgres; пустую и неполную копию не признаёт"
rc_image=$(awk '/^  postgres:/ {f=1; next} /^  [a-z0-9-]+:/ {f=0} f && /image:/ {print $2; exit}' "$HERE/../../docker-compose.yml" | tr -d "\"'")
if ! command -v age-keygen >/dev/null 2>&1; then
  echo "  ПРОПУЩЕНО: нет age"; SKIP=$((SKIP+1))
elif ! docker info >/dev/null 2>&1; then
  echo "  ПРОПУЩЕНО: docker недоступен"; SKIP=$((SKIP+1))
elif [ -z "$rc_image" ] || ! docker image inspect "$rc_image" >/dev/null 2>&1; then
  echo "  ПРОПУЩЕНО: образа Postgres нет локально ($rc_image)"; SKIP=$((SKIP+1))
else
  fake_dump() {  # fake_dump <файл> <SQL со строками users>
    printf '%s\n' '-- fake pg_dump' \
      'CREATE TABLE alembic_version (version_num varchar(32) NOT NULL);' \
      "INSERT INTO alembic_version VALUES ('abc123');" \
      'CREATE TABLE users (id int);' \
      "$2" \
      '-- PostgreSQL database dump complete' > "$1"
  }
  rc_run() { AGE_KEY_FILE="$T/key.txt" "$HERE/restore-check.sh" "$1" >"$T/rc.out" 2>&1; }
  not_proven() {  # в выводе не должно быть успеха
    if grep -q 'ВОССТАНОВЛЕНИЕ ПРОВЕРЕНО' "$T/rc.out"; then bad "$1: провальная копия объявлена проверенной"; else ok; fi
  }

  new_env
  printf 'MESSAGE_ENCRYPTION_KEY=k1\nPOSTGRES_PASSWORD=p1\n' > "$MERIDIAN_DIR/.env"
  fake_dump "$T/fake.sql" "INSERT INTO users VALUES (1);"
  age-keygen -o "$T/key.txt" >/dev/null 2>&1; age-keygen -y "$T/key.txt" > "$T/recipient.pub"
  BACKUP_ENCRYPT=1 AGE_RECIPIENT_FILE="$T/recipient.pub" BACKUP_NAME=2026-10-01_033000 "$HERE/backup.sh" >/dev/null 2>&1
  rc_run "$BACKUP_DIR"; rc=$?
  eq "restore-check: нормальная зашифрованная копия → код 0" "$rc" 0
  if grep -q 'ВОССТАНОВЛЕНИЕ ПРОВЕРЕНО' "$T/rc.out"; then ok; else bad "нет строки об успехе: $(tail -n 3 "$T/rc.out" | tr '\n' ' ')"; fi
  if grep -q 'users: 1' "$T/rc.out"; then ok; else bad "не посчитал users"; fi
  eq "RESTORE_STATUS=OK" "$(status_word "$BACKUP_DIR/RESTORE_STATUS")" "OK"

  new_env
  printf 'MESSAGE_ENCRYPTION_KEY=k1\nPOSTGRES_PASSWORD=p1\n' > "$MERIDIAN_DIR/.env"
  fake_dump "$T/fake.sql" ""
  backup 2026-10-01_033000
  rc_run "$BACKUP_DIR"; rc=$?
  ne "restore-check: пустая users → провал" "$rc" 0
  not_proven "пустая users"
  eq "пустая users → RESTORE_STATUS=FAILED" "$(status_word "$BACKUP_DIR/RESTORE_STATUS")" "FAILED"

  new_env
  printf 'MESSAGE_ENCRYPTION_KEY=k1\nPOSTGRES_PASSWORD=p1\n' > "$MERIDIAN_DIR/.env"
  printf '%s\n' '-- fake pg_dump' 'CREATE TABLE users (id int);' 'INSERT INTO users VALUES (1);' '-- PostgreSQL database dump complete' > "$T/fake.sql"
  backup 2026-10-01_033000
  rc_run "$BACKUP_DIR"; rc=$?
  ne "restore-check: нет alembic_version → провал (раньше «нет данных» давало успех)" "$rc" 0
  not_proven "нет alembic_version"

  new_env
  printf 'POSTGRES_PASSWORD=p1\n' > "$MERIDIAN_DIR/.env"
  fake_dump "$T/fake.sql" "INSERT INTO users VALUES (1);"
  backup 2026-10-01_033000
  rc_run "$BACKUP_DIR"; rc=$?
  ne "restore-check: в .env нет MESSAGE_ENCRYPTION_KEY → провал" "$rc" 0
  if grep -q 'MESSAGE_ENCRYPTION_KEY' "$T/rc.out"; then ok; else bad "причина (ключ сообщений) не названа"; fi
  not_proven "нет ключа сообщений"
fi

# ── проверка индексов прода (amcheck) ────────────────────────────────────────
section "pull: проверка индексов прода: разбор ответа (подставной ответ)"
new_env
PROD="$BACKUP_DIR"; MIRROR="$T/mirror"
backup 2026-10-01_033000
ic_pull() { INDEX_CHECK=1 INDEX_CHECK_CMD="$1" PULL_SRC="$PROD" LOCAL_DIR="$MIRROR" "$HERE/pull-backups.sh" >/dev/null 2>&1; }
ic_pull 'echo "AMCHECK_DONE checked=12 bad=0 skipped=0"'; rc=$?
eq "все индексы целы → код 0" "$rc" 0
eq "статус OK" "$(status_word "$MIRROR/STATUS")" "OK"
grep -q 'проверено 12' "$MIRROR/pull.log" && ok || bad "в логе нет «проверено 12»"
ic_pull 'printf "AMCHECK_BAD ix_users_email | item order invariant violated\nAMCHECK_DONE checked=11 bad=1 skipped=0\n"'; rc=$?
eq "повреждённый индекс → код 6" "$rc" 6
eq "статус PROBLEMS" "$(status_word "$MIRROR/STATUS")" "PROBLEMS"
grep -q 'ix_users_email' "$MIRROR/pull.log" && ok || bad "имя индекса не попало в лог"
ic_pull 'printf "AMCHECK_SKIPPED ix_a\nAMCHECK_DONE checked=3 bad=0 skipped=1\n"'; rc=$?
eq "таблица занята → код 6" "$rc" 6
ic_pull 'echo "AMCHECK_DONE checked=0 bad=0 skipped=0"'; rc=$?
eq "проверять нечего → код 6" "$rc" 6
ic_pull 'exit 7'; rc=$?
eq "проверка упала → код 6" "$rc" 6
ic_pull 'echo привет'; rc=$?
eq "ответ без итоговой строки → код 6" "$rc" 6
expect_ok "локальные копии при проблемах целы" test -f "$MIRROR/2026-10-01_033000/COMPLETE"
ic_pull 'echo "AMCHECK_DONE checked=12 bad=0 skipped=0"'; rc=$?
eq "после исправления снова код 0" "$rc" 0
eq "статус снова OK" "$(status_word "$MIRROR/STATUS")" "OK"

section "индексы: настоящий Postgres: сломанный индекс находят, целый не винят, занятую таблицу не считают проверенной"
ic_image=$(awk '/^  postgres:/ {f=1; next} /^  [a-z0-9-]+:/ {f=0} f && /image:/ {print $2; exit}' "$HERE/../../docker-compose.yml" | tr -d "\"'")
if ! docker info >/dev/null 2>&1; then
  echo "  ПРОПУЩЕНО: docker недоступен"; SKIP=$((SKIP+1))
elif [ -z "$ic_image" ] || ! docker image inspect "$ic_image" >/dev/null 2>&1; then
  echo "  ПРОПУЩЕНО: образа Postgres нет локально ($ic_image)"; SKIP=$((SKIP+1))
else
  IC_CONTAINER="meridian-index-check-test-$$"
  docker run -d --name "$IC_CONTAINER" -e POSTGRES_USER=meridian -e POSTGRES_PASSWORD=x -e POSTGRES_DB=meridian "$ic_image" >/dev/null
  ic_ready=0
  for _ in $(seq 1 120); do
    ic_logs=$(docker logs "$IC_CONTAINER" 2>&1 || true)
    if [[ $ic_logs == *"PostgreSQL init process complete"* ]] && docker exec "$IC_CONTAINER" pg_isready -U meridian -d meridian >/dev/null 2>&1; then ic_ready=1; break; fi
    sleep 1
  done
  if [ "$ic_ready" != 1 ]; then
    bad "временный Postgres не запустился"
  else
    dq() { docker exec -i "$IC_CONTAINER" psql -U meridian -d meridian -X -q -At -v ON_ERROR_STOP=1 "$@"; }
    dq >/dev/null <<'SQL'
CREATE FUNCTION flip(t text) RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF current_setting('meridian.flip', true) = 'on' THEN RETURN reverse(t); END IF;
  RETURN t;
END $$;
CREATE TABLE ic_t (x text);
INSERT INTO ic_t SELECT 'k' || g || 'z' FROM generate_series(1, 300) g;
CREATE UNIQUE INDEX ic_t_flip ON ic_t (flip(x));
CREATE TABLE ic_ok (x text PRIMARY KEY);
INSERT INTO ic_ok SELECT 'v' || g FROM generate_series(1, 300) g;
SQL
    ICMD="docker exec -i $IC_CONTAINER psql -U meridian -d meridian -X -q -At -v ON_ERROR_STOP=1 -v lt=500ms"
    new_env
    PROD="$BACKUP_DIR"; MIRROR="$T/mirror-real"
    backup 2026-10-01_033000

    ic_pull "$ICMD"; rc=$?
    eq "здоровая база → код 0" "$rc" 0
    grep -q 'проверено 2' "$MIRROR/pull.log" && ok || bad "в логе нет «проверено 2»: $(tail -n 3 "$MIRROR/pull.log" | tr '\n' ' ')"

    # настоящая порча: индекс построен при одних правилах, база теперь считает по другим (как смена правил сортировки)
    dq -c "ALTER DATABASE meridian SET meridian.flip = 'on'"
    ic_pull "$ICMD"; rc=$?
    eq "повреждённый индекс → код 6" "$rc" 6
    eq "статус PROBLEMS" "$(status_word "$MIRROR/STATUS")" "PROBLEMS"
    grep -q 'повреждены.*ic_t_flip' "$MIRROR/pull.log" && ok || bad "ic_t_flip не назван повреждённым"
    if grep 'повреждены' "$MIRROR/pull.log" | grep -q 'ic_ok_pkey'; then bad "целый индекс ic_ok_pkey назван повреждённым"; else ok; fi

    dq -c "REINDEX INDEX ic_t_flip"
    ic_pull "$ICMD"; rc=$?
    eq "после REINDEX → код 0" "$rc" 0
    eq "после REINDEX статус OK" "$(status_word "$MIRROR/STATUS")" "OK"

    # занятая таблица: проверка не должна считаться пройденной
    docker exec "$IC_CONTAINER" psql -U meridian -d meridian -X -q -At \
      -c "BEGIN; LOCK TABLE ic_t IN ACCESS EXCLUSIVE MODE; SELECT pg_sleep(10); COMMIT;" >/dev/null 2>&1 &
    HOLDER=$!
    sleep 1.5
    ic_pull "$ICMD"; rc=$?
    eq "таблица занята → код 6" "$rc" 6
    grep -q 'не удалось проверить.*ic_t_flip' "$MIRROR/pull.log" && ok || bad "занятый индекс не назван в логе"
    wait "$HOLDER" 2>/dev/null || true
  fi
  docker rm -f "$IC_CONTAINER" >/dev/null 2>&1; IC_CONTAINER=""
fi

# ── образ Postgres закреплён по дайджесту ────────────────────────────────────
section "compose: образ Postgres закреплён по дайджесту и это тот образ, что реально запущен"
CF="$HERE/../../docker-compose.yml"
if ! docker info >/dev/null 2>&1; then
  echo "  ПРОПУЩЕНО: docker недоступен"; SKIP=$((SKIP+1))
else
  for svc in postgres postgres-test; do
    img=$(awk -v s="$svc" '$0 ~ ("^  " s ":") {f=1; next} /^  [a-z0-9-]+:/ {f=0} f && /image:/ {print $2; exit}' "$CF" | tr -d "\"'")
    if [[ $img =~ ^pgvector/pgvector@sha256:[0-9a-f]{64}$ ]]; then ok; else bad "$svc: образ не закреплён по дайджесту ('$img')"; continue; fi
    want=$(docker image inspect --format '{{.Id}}' "$img" 2>/dev/null) || want=""
    if [ -z "$want" ]; then bad "$svc: закреплённого образа нет локально ($img)"; continue; fi
    cid=$(cd "$HERE/../.." && docker compose ps -q "$svc" 2>/dev/null) || cid=""
    if [ -z "$cid" ]; then echo "  ПРОПУЩЕНО: $svc не запущен"; SKIP=$((SKIP+1)); continue; fi
    eq "$svc: запущен именно закреплённый образ" "$(docker inspect --format '{{.Image}}' "$cid")" "$want"
  done
fi

# ── свежесть доказательства восстановимости ──────────────────────────────────
section "restore_proof_state: слово и код на настоящих файлах статуса"
NOW=$(date +%s); DAY=86400
RP=$(mktemp -d); TMPS+=("$RP")
rps() { bash -c ". '$HERE/lib.sh'; restore_proof_state \"\$@\"" _ "$@"; }
rp_case() {
  local d="$1" want="$2" content="$3" out rc=0
  printf '%s\n' "$content" > "$RP/s"
  out=$(rps "$RP/s" "$NOW" $((35*DAY))) || rc=$?
  eq "$d: слово" "$out" "$want"
  if [ "$want" = ok ]; then eq "$d: код" "$rc" 0; else ne "$d: код не 0" "$rc" 0; fi
}
rp_case "34 дня"                       ok     "OK $((NOW-34*DAY)) n"
rp_case "ровно 35 дней"                ok     "OK $((NOW-35*DAY)) n"
rp_case "35 дней и секунда"            stale  "OK $((NOW-35*DAY-1)) n"
rp_case "40 дней"                      stale  "OK $((NOW-40*DAY)) n"
rp_case "FAILED, свежий"               failed "FAILED $NOW n"
rp_case "мусор вместо времени"         bad    "OK abc n"
rp_case "неизвестный статус"           bad    "WAT $NOW n"
rp_case "пустая строка"                bad    ""
rp_case "время из будущего (+2 ч)"     bad    "OK $((NOW+7200)) n"
rp_case "небольшой сдвиг часов (+1 мин)" ok   "OK $((NOW+60)) n"
rc=0; out=$(rps "$RP/none" "$NOW" $((35*DAY))) || rc=$?
eq "нет файла: слово" "$out" missing; ne "нет файла: код не 0" "$rc" 0
: > "$RP/s"; rc=0; out=$(rps "$RP/s" "$NOW" $((35*DAY))) || rc=$?
eq "файл 0 байт: слово" "$out" bad; ne "файл 0 байт: код не 0" "$rc" 0

section "pull: нет/старое/FAILED доказательство восстановимости = проблема (код 6), свежее = ок, не залипает"
new_env
backup 2026-10-05_033000
RPS="$BACKUP_DIR"; RML=$(mktemp -d); TMPS+=("$RML")
rp_pull() { RESTORE_PROOF_CHECK=1 PULL_SRC="$RPS" LOCAL_DIR="$RML" "$HERE/pull-backups.sh" >/dev/null 2>&1; }
printf 'OK %s n\n' "$(date +%s)" > "$RML/RESTORE_STATUS"
rp_pull; rc=$?
eq "свежее доказательство: код" "$rc" 0
eq "свежее доказательство: STATUS" "$(status_word "$RML/STATUS")" OK
printf 'OK %s n\n' "$(( $(date +%s) - 40*DAY ))" > "$RML/RESTORE_STATUS"
rp_pull; rc=$?
eq "старое доказательство: код" "$rc" 6
eq "старое доказательство: STATUS" "$(status_word "$RML/STATUS")" PROBLEMS
grep -q 'доказательство восстановимости: stale' "$RML/pull.log" && ok || bad "старое: причина не попала в лог"
printf 'FAILED %s n\n' "$(date +%s)" > "$RML/RESTORE_STATUS"
rp_pull; rc=$?
eq "FAILED: код" "$rc" 6
grep -q 'доказательство восстановимости: failed' "$RML/pull.log" && ok || bad "FAILED: причина не попала в лог"
rm -f "$RML/RESTORE_STATUS"
rp_pull; rc=$?
eq "нет файла: код" "$rc" 6
grep -q 'доказательство восстановимости: missing' "$RML/pull.log" && ok || bad "нет файла: причина не попала в лог"
RESTORE_PROOF_CHECK=0 PULL_SRC="$RPS" LOCAL_DIR="$RML" "$HERE/pull-backups.sh" >/dev/null 2>&1; rc=$?
eq "проверка выключена: код" "$rc" 0
printf 'OK %s n\n' "$(date +%s)" > "$RML/RESTORE_STATUS"
rp_pull; rc=$?
eq "после восстановления доказательства: код" "$rc" 0
eq "после восстановления доказательства: STATUS" "$(status_word "$RML/STATUS")" OK

section "systemd-юниты в репозитории: ExecStart ведёт на настоящий скрипт, у каждого сервиса есть таймер"
for u in "$HERE"/systemd/*.service; do
  exe=$(sed -n 's|^ExecStart=%h/Документы/meridian-web/||p' "$u")
  if [ -n "$exe" ] && [ -x "$HERE/../../$exe" ]; then ok; else bad "$(basename "$u"): ExecStart не ведёт на исполняемый скрипт репозитория ('$exe')"; fi
  if [ -f "${u%.service}.timer" ]; then ok; else bad "$(basename "$u"): нет парного .timer"; fi
done

section "тесты не читают stdin вызывающего (иначе docker/psql съедают скрипт, запущенный через bash -s)"
if [ "$(readlink /proc/self/fd/0)" = "/dev/null" ]; then
  ok
  eq "дочерний процесс, читающий stdin, получает пустоту" "$(bash -c 'cat')" ""
else
  bad "stdin набора не отвязан от вызывающего ($(readlink /proc/self/fd/0))"
fi

echo "ИТОГО: прошло $PASS, провалилось $FAIL, пропущено секций: $SKIP"
[ "$FAIL" -eq 0 ]
