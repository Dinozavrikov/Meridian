"""Разовый бэкфилл согласий: PYTHONPATH=/app python scripts/backfill_record_shares.py (идемпотентен)."""
import asyncio

from app.db.session import AsyncSessionLocal
from app.services.record_shares import backfill_record_shares


async def main():
    async with AsyncSessionLocal() as db:
        n = await backfill_record_shares(db)
        await db.commit()
        print(f"добавлено строк согласия: {n}")


asyncio.run(main())
