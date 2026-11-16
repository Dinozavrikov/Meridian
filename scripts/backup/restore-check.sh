#!/usr/bin/env bash
# Проверка восстановления: расшифровывает копию ключом age (если она зашифрована), проверяет содержимое, поднимает
# ВРЕМЕННЫЙ Postgres в docker (образ из docker-compose.yml: совпадают версия и расширения вроде pgvector), заливает
# дамп и проверяет результат: в alembic_version ровно одна версия, в users есть строки, в env.backup есть непустые
# MESSAGE_ENCRYPTION_KEY и POSTGRES_PASSWORD (список — REQUIRED_ENV_KEYS). Пустая или неполная копия — провал (код ≠ 0).
# Итог пишется в RESTORE_STATUS рядом с копиями: «OK|FAILED <epoch> <имя>».
# Использование: restore-check.sh [каталог_копий] [имя_копии]   (по умолчанию ~/meridian-backups/prod, самая свежая)
# Ключ: AGE_KEY_FILE (по умолчанию ~/.config/meridian-backup/age-key.txt). Расшифрованное лежит во временном
# каталоге с правами 700 и удаляется при выходе.
set -euo pipefail
umask 077
SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
. "$SELF_DIR/lib.sh"

ROOT="${1:-$HOME/meridian-backups/prod}"
NAME="${2:-$(latest_complete "$ROOT")}"
CNAME="meridian-restore-check-$$"
WORK=""
OKRUN=0
cleanup() {
  docker rm -f "$CNAME" >/dev/null 2>&1 || true
  if [ -n "$WORK" ]; then rm -rf -- "$WORK"; fi
  if [ "$OKRUN" != 1 ] && [ -d "$ROOT" ]; then
    printf 'FAILED %s %s\n' "$(date +%s)" "${NAME:-?}" > "$ROOT/RESTORE_STATUS" 2>/dev/null || true
  fi
}
trap cleanup EXIT

[ -n "$NAME" ] || die "в $ROOT нет полных копий"
DIR="$ROOT/$NAME"
reason=$(verify_backup "$DIR") || die "копия $NAME не проходит проверку целостности: $reason"
log "копия $NAME цела (по метаданным)"

if is_encrypted_backup "$DIR"; then
  KEY="${AGE_KEY_FILE:-$HOME/.config/meridian-backup/age-key.txt}"
  [ -f "$KEY" ] || die "копия зашифрована, а ключа нет: $KEY (укажите AGE_KEY_FILE=...)"
  WORK=$(mktemp -d)
  extract_backup "$DIR" "$KEY" "$WORK" || die "расшифровать не удалось: ключ не тот или архив повреждён"
  reason=$(verify_backup "$WORK") || die "расшифрованное содержимое не прошло проверку: $reason"
  log "расшифровка и проверка содержимого: ок"
  DIR="$WORK"
fi

REQUIRED_ENV_KEYS="${REQUIRED_ENV_KEYS-MESSAGE_ENCRYPTION_KEY POSTGRES_PASSWORD}"
for k in $REQUIRED_ENV_KEYS; do
  [ -f "$DIR/env.backup" ] || die "в копии нет env.backup (нужен $k): восстановление было бы неполным"
  env_has_value "$DIR/env.backup" "$k" || die "в env.backup нет непустого $k: восстановление было бы неполным"
done
log "env.backup: обязательные переменные на месте (${REQUIRED_ENV_KEYS:-проверка отключена})"

IMAGE="${PG_IMAGE:-}"
if [ -z "$IMAGE" ]; then
  IMAGE=$(awk '/^  postgres:/ {f=1; next} /^  [a-z0-9-]+:/ {f=0} f && /image:/ {print $2; exit}' "$SELF_DIR/../../docker-compose.yml" | tr -d "\"'")
fi
[ -n "$IMAGE" ] || die "не нашёл образ Postgres в docker-compose.yml — задайте PG_IMAGE=..."
log "образ: $IMAGE"

docker run -d --name "$CNAME" -e POSTGRES_USER=meridian -e POSTGRES_PASSWORD=restore-check -e POSTGRES_DB=meridian "$IMAGE" >/dev/null

ready=0
for _ in $(seq 1 120); do
  logs=$(docker logs "$CNAME" 2>&1 || true)
  if [[ $logs == *"PostgreSQL init process complete"* ]] && docker exec "$CNAME" pg_isready -U meridian -d meridian >/dev/null 2>&1; then
    ready=1; break
  fi
  sleep 1
done
[ "$ready" = 1 ] || die "временный Postgres не запустился за 2 минуты"

log "заливаю дамп..."
gzip -dc "$DIR/db.sql.gz" | docker exec -i "$CNAME" psql -U meridian -d meridian -v ON_ERROR_STOP=1 -q -o /dev/null \
  || die "дамп не залился: восстановление НЕ работает"

# Ошибки запросов НЕ маскируются: «нет данных» вместо числа раньше приводило к ложному «ПРОВЕРЕНО».
q() { docker exec "$CNAME" psql -U meridian -d meridian -v ON_ERROR_STOP=1 -Atc "$1"; }
a_rows=$(q "select count(*) from alembic_version") || die "восстановление НЕ доказано: в восстановленной базе нет таблицы alembic_version"
a_ver=$(q "select coalesce(max(version_num), '') from alembic_version") || die "восстановление НЕ доказано: не прочитать версию миграции"
n_users=$(q "select count(*) from users") || die "восстановление НЕ доказано: в восстановленной базе нет таблицы users"
reason=$(restore_facts_ok "$a_rows" "$a_ver" "$n_users") || die "восстановление НЕ доказано: $reason"

INV_SQL="select table_name || ' ' || (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by 1"
inv=$(q "$INV_SQL") || die "восстановление НЕ доказано: не удалось посчитать строки по таблицам"
n_tables=$(printf '%s\n' "$inv" | wc -l)
n_filled=$(printf '%s\n' "$inv" | awk '$2 > 0' | wc -l)
log "миграция: $a_ver; таблиц: $n_tables, непустых: $n_filled; users: $n_users"
log "строк по таблицам: $(printf '%s\n' "$inv" | awk '{printf "%s=%s ", $1, $2}')"
log "файлы по метаданным: $(grep '^dir\.' "$DIR/meta.txt" | tr '\n' ' ')"
OKRUN=1
printf 'OK %s %s\n' "$(date +%s)" "$NAME" > "$ROOT/RESTORE_STATUS"
log "ВОССТАНОВЛЕНИЕ ПРОВЕРЕНО: $NAME"
