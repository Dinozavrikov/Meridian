"""
Оборачивает `alembic upgrade head` явной Postgres advisory lock, чтобы
несколько одновременно стартующих backend-контейнеров (масштабирование)
не гоняли миграцию параллельно — второй просто дождётся первого вместо
гонки за строкой alembic_version.
"""
import asyncio
import subprocess
import sys

import asyncpg

from app.core.config import settings

# Произвольное фиксированное число — просто общий "замок" для миграций
# этого проекта. Не пересекается с другими advisory-lock'ами в коде,
# т.к. сейчас их больше нигде нет.
MIGRATION_LOCK_ID = 727_271_001


async def main() -> int:
    # asyncpg использует postgresql://, не postgresql+asyncpg://
    dsn = settings.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://", 1)
    conn = await asyncpg.connect(dsn)
    try:
        print("==> Ждём advisory lock на миграцию…", flush=True)
        await conn.execute("SELECT pg_advisory_lock($1)", MIGRATION_LOCK_ID)
        print("==> Lock получен, применяем миграции", flush=True)
        result = subprocess.run(["alembic", "upgrade", "head"])
        return result.returncode
    finally:
        await conn.execute("SELECT pg_advisory_unlock($1)", MIGRATION_LOCK_ID)
        await conn.close()


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
