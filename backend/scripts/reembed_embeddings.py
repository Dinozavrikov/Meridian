"""Пересчёт эмбеддингов текущей моделью (только устаревшие; --all — все).
Запуск (внутри контейнера backend): env PYTHONPATH=/app python3 scripts/reembed_embeddings.py [--all]"""
import asyncio
import sys

from app.db.session import AsyncSessionLocal
from app.services.embeddings import reembed_all_entities


async def main() -> None:
    async with AsyncSessionLocal() as db:
        print(await reembed_all_entities(db, only_stale="--all" not in sys.argv), flush=True)


if __name__ == "__main__":
    asyncio.run(main())
