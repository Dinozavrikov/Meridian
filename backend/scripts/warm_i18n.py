"""Прогрев кэша переводов интерфейса, чтобы новый язык не переводился «на живых» пользователях.
Запуск (внутри контейнера backend), словарь ключей идёт в stdin:
  cat allkeys.json | env PYTHONPATH=/app python3 scripts/warm_i18n.py en ja"""
import asyncio
import json
import sys
import time

from app.api.v1.i18n import EnsureRequest, ensure_translations
from app.db.session import AsyncSessionLocal

CHUNK = 30  # ~15–20 с на пачку; сама очередь к модели держит ai._call_llm


async def warm_locale(locale, items, chunk=CHUNK, ensure=ensure_translations):
    ok = failed = 0
    for i in range(0, len(items), chunk):
        part = dict(items[i:i + chunk])
        async with AsyncSessionLocal() as db:
            reply = await ensure(locale, EnsureRequest(strings=part), user=None, db=db)
        failed += len(reply.missing)
        ok += len(part) - len(reply.missing)
    return {"locale": locale, "ok": ok, "failed": failed}


async def main(locales):
    items = list(json.load(sys.stdin).items())
    for locale in locales:
        t0 = time.time()
        res = await warm_locale(locale, items)
        print({**res, "sec": round(time.time() - t0)}, flush=True)


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1:]))
