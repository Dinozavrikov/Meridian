"""Сверка упоминаний: PYTHONPATH=/app python scripts/reconcile_mentions.py [--apply] (по умолчанию dry-run; идемпотентна)."""
import asyncio
import sys

from app.db.session import AsyncSessionLocal
from app.services.mention_reconcile import reconcile_mentions


async def main(apply: bool):
    async with AsyncSessionLocal() as db:
        counts = await reconcile_mentions(db, apply=apply)
        if apply:
            await db.commit()
        print(("ПРИМЕНЕНО" if apply else "dry-run, ничего не записано"), counts)


asyncio.run(main("--apply" in sys.argv))
