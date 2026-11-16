#!/usr/bin/env bash
# Забирает копии с прода на этот компьютер и хранит их по СВОЕЙ схеме: удаление на проде сюда не
# передаётся (если прод сломан или очищен, здесь копии остаются). Запуск по cron/таймеру на резервной машине.
# Забранная копия получает маркер COMPLETE только после проверки (дамп, контрольная сумма, число и размер файлов).
# Коды выхода: 0 ок; 1 ошибка; 4 уже выполняется; 6 есть проблемы (копия на проде устарела/FAILED/не прошла проверку; индексы прода повреждены или не проверены; доказательство восстановимости отсутствует/FAILED/старше 35 дней).
set -euo pipefail
umask 077
SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
. "$SELF_DIR/lib.sh"

# Адрес прода: из окружения, иначе SERVER из файла настроек вне репозитория.
_DEPLOY_ENV="${DEPLOY_ENV:-$HOME/.config/meridian/deploy.env}"
[ -f "$_DEPLOY_ENV" ] && . "$_DEPLOY_ENV"
PROD_SSH="${PROD_SSH:-${SERVER:-}}"
PROD_BACKUP_DIR="${PROD_BACKUP_DIR:-meridian-backups}"
PULL_SRC="${PULL_SRC:-${PROD_SSH:?PROD_SSH не задан: укажи SERVER в deploy.env}:$PROD_BACKUP_DIR}"      # в тестах — обычный локальный путь
LOCAL_DIR="${LOCAL_DIR:-$HOME/meridian-backups/prod}"
MAX_AGE_H="${MAX_AGE_H:-36}"
SSH_CMD="ssh -o BatchMode=yes -o ConnectTimeout=15 -o ServerAliveInterval=15"

case "$LOCAL_DIR" in /?*) ;; *) echo "LOCAL_DIR должен быть абсолютным путём" >&2; exit 1 ;; esac
mkdir -p "$LOCAL_DIR"
chmod 700 "$LOCAL_DIR"
exec 9>"$LOCAL_DIR/.lock"
flock -n 9 || { echo "$(date '+%F %T') ОШИБКА: pull уже выполняется" >&2; exit 4; }

LOG="$LOCAL_DIR/pull.log"
if [ -f "$LOG" ] && [ "$(wc -l < "$LOG")" -gt 2000 ]; then
  tail -n 1000 "$LOG" > "$LOG.tmp" && mv -f "$LOG.tmp" "$LOG"
fi
if [ -t 1 ]; then exec > >(tee -a "$LOG") 2>&1; else exec >> "$LOG" 2>&1; fi

PROBLEMS=0
problem() { log "ПРОБЛЕМА: $1"; PROBLEMS=$((PROBLEMS+1)); }

# 1. забрать новые копии (COMPLETE не берём: его ставит проверка ниже; недостроенные .partial-* и прочее не берём)
rc=0
rsync -aH --partial -e "$SSH_CMD" \
  --exclude='COMPLETE' \
  --include='20??-??-??_??????/' --include='20??-??-??_??????/**' \
  --exclude='*' \
  "${PULL_SRC%/}/" "$LOCAL_DIR/" || rc=$?
if [ "$rc" -ne 0 ] && [ "$rc" -ne 24 ]; then problem "rsync вернул код $rc (прод недоступен?)"; fi

# 2. проверить непомеченные копии и пометить годные
for p in "$LOCAL_DIR"/*/; do
  [ -d "$p" ] || continue
  name=$(basename "$p")
  [[ $name =~ $BACKUP_NAME_RE ]] || continue
  if [ -f "${p}COMPLETE" ]; then continue; fi
  if reason=$(verify_backup "${p%/}"); then
    date +%s > "${p}COMPLETE"
    log "получена и проверена копия $name"
  else
    problem "копия $name не прошла проверку: $reason"
  fi
done

# 3. своя чистка по тем же правилам
prune_backups "$LOCAL_DIR" || problem "чистка локальных копий не удалась (код $?)"

# 4. состояние бэкапа на проде
rm -f "$LOCAL_DIR/PROD_LAST_STATUS"
rc=0
rsync -a -e "$SSH_CMD" "${PULL_SRC%/}/LAST_STATUS" "$LOCAL_DIR/PROD_LAST_STATUS" || rc=$?
if [ "$rc" -ne 0 ]; then
  problem "не удалось прочитать LAST_STATUS прода (код $rc)"
else
  st=""; ts=0; rest=""
  read -r st ts rest < "$LOCAL_DIR/PROD_LAST_STATUS" || true
  if [ "$st" != "OK" ]; then problem "последняя копия на проде: ${st:-?} ${rest}"; fi
  age=$(( $(date +%s) - ${ts:-0} ))
  if [ "$age" -gt $(( MAX_AGE_H * 3600 )) ]; then problem "копия на проде устарела: ей $(( age / 3600 )) ч (порог $MAX_AGE_H ч)"; fi
fi

# 5. здоровье индексов на проде (amcheck, только чтение). Случай 2026-10: три текстовых индекса сломались, ON CONFLICT не видел
#    существующие строки и вставлял дубли, а бэкап оставался «успешным» и не заливался обратно. INDEX_CHECK=0 отключает (тесты).
if [ "${INDEX_CHECK:-1}" = 1 ]; then
  ic_sql="$SELF_DIR/index-check.sql"
  ic_err=$(mktemp); ic_out=""; ic_rc=0
  if [ -n "${INDEX_CHECK_CMD:-}" ]; then
    ic_out=$(bash -c "$INDEX_CHECK_CMD" < "$ic_sql" 2> "$ic_err") || ic_rc=$?
  else
    ic_remote="cd ${PROD_APP_DIR:-meridian-web} && docker compose -f docker-compose.yml exec -T postgres sh -c 'psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -X -q -At -v ON_ERROR_STOP=1'"
    ic_out=$($SSH_CMD "$PROD_SSH" "$ic_remote" < "$ic_sql" 2> "$ic_err") || ic_rc=$?
  fi
  { grep -v 'POSTGRES_TEST_PASSWORD' "$ic_err" | sed 's/^/  stderr: /'; } || true
  rm -f "$ic_err"
  ic_done=$(printf '%s\n' "$ic_out" | sed -n 's/^AMCHECK_DONE //p' | tail -n 1)
  if [ "$ic_rc" -ne 0 ] || [ -z "$ic_done" ]; then
    problem "проверка индексов прода не выполнилась (код $ic_rc), см. stderr выше"
  else
    ic_checked=$(printf '%s\n' "$ic_done" | sed -n 's/.*checked=\([0-9]*\).*/\1/p')
    ic_bad=$(printf '%s\n' "$ic_done" | sed -n 's/.*bad=\([0-9]*\).*/\1/p')
    ic_skipped=$(printf '%s\n' "$ic_done" | sed -n 's/.*skipped=\([0-9]*\).*/\1/p')
    ic_bad_names=$(printf '%s\n' "$ic_out" | sed -n 's/^AMCHECK_BAD \([^ ]*\) .*/\1/p' | tr '\n' ' ')
    ic_skip_names=$(printf '%s\n' "$ic_out" | sed -n 's/^AMCHECK_SKIPPED //p' | tr '\n' ' ')
    if [ "${ic_bad:-0}" -gt 0 ]; then problem "индексы прода повреждены (${ic_bad}): ${ic_bad_names}— лечение: REINDEX, см. BACKUP.md"; fi
    if [ "${ic_skipped:-0}" -gt 0 ]; then problem "не удалось проверить индексы (таблица занята): ${ic_skip_names}"; fi
    if [ "${ic_checked:-0}" -eq 0 ] && [ "${ic_bad:-0}" -eq 0 ] && [ "${ic_skipped:-0}" -eq 0 ]; then
      problem "проверять нечего: btree-индексов в базе нет, проверка ничего не доказывает"
    fi
    if [ "${ic_bad:-0}" -eq 0 ] && [ "${ic_skipped:-0}" -eq 0 ] && [ "${ic_checked:-0}" -gt 0 ]; then
      log "индексы прода: проверено ${ic_checked}, повреждённых нет"
    fi
  fi
fi

# 6. доказательство восстановимости не должно протухнуть: нужен RESTORE_STATUS=OK не старше RESTORE_MAX_AGE_D дней
#    (его пишет restore-check.sh по месячному таймеру). Нет файла / FAILED / старый = проблема.
#    RESTORE_PROOF_CHECK=0 отключает (тесты).
if [ "${RESTORE_PROOF_CHECK:-1}" = 1 ]; then
  RESTORE_MAX_AGE_D="${RESTORE_MAX_AGE_D:-35}"
  if rp=$(restore_proof_state "$LOCAL_DIR/RESTORE_STATUS" "$(date +%s)" $((RESTORE_MAX_AGE_D * 86400))); then
    log "проверка восстановления: свежая (не старше ${RESTORE_MAX_AGE_D} дн.)"
  else
    problem "доказательство восстановимости: $rp (нужен RESTORE_STATUS=OK не старше ${RESTORE_MAX_AGE_D} дн.; запусти scripts/backup/restore-check.sh)"
  fi
fi

newest=$(latest_complete "$LOCAL_DIR")
if [ -z "$newest" ]; then problem "здесь нет ни одной полной копии"; fi

if [ "$PROBLEMS" -eq 0 ]; then
  echo "OK $(date +%s) $newest" > "$LOCAL_DIR/STATUS"
  log "готово, последняя копия: $newest"
  exit 0
fi
echo "PROBLEMS $(date +%s) count=$PROBLEMS newest=${newest:-нет}" > "$LOCAL_DIR/STATUS"
log "завершено с проблемами: $PROBLEMS"
exit 6
