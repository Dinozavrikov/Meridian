"""Прогрев кэша переводов интерфейса, чтобы новый язык не переводился «на живых» пользователях.
Запуск (внутри контейнера backend), словарь ключей идёт в stdin:
  cat allkeys.json | env PYTHONPATH=/app python3 scripts/warm_i18n.py en ja
  env PYTHONPATH=/app python3 scripts/warm_i18n.py --auth   (белый список, языки из кэша)"""
import asyncio
import json
import sys
import time

from sqlalchemy import select

from app.api.v1.i18n import ensure_ui_translations
from app.core.auth_ui_strings import AUTH_UI_STRINGS
from app.db.session import AsyncSessionLocal
from app.models.i18n import UIStringTranslation

CHUNK = 30  # ~15–20 с на пачку; сама очередь к модели держит ai._call_llm


async def warm_locale(locale, items, chunk=CHUNK, ensure=ensure_ui_translations):
    ok = failed = 0
    for i in range(0, len(items), chunk):
        part = dict(items[i:i + chunk])
        async with AsyncSessionLocal() as db:
            reply = await ensure(db, locale, part)
        failed += len(reply.missing)
        ok += len(part) - len(reply.missing)
    return {"locale": locale, "ok": ok, "failed": failed}


def auth_items():
    """Белый список экранов входа и гостевого шелла: ключ равен тексту (канал dt)."""
    return [(t, t) for t in sorted(AUTH_UI_STRINGS)]


async def cached_locales():
    """Языки, которые уже есть в кэше: их и прогреваем, список не хардкодим."""
    async with AsyncSessionLocal() as db:
        rows = await db.execute(select(UIStringTranslation.target_lang).distinct())
        return sorted(r[0] for r in rows.all())


async def main(args):
    auth = "--auth" in args
    locales = [a for a in args if not a.startswith("--")] or await cached_locales()
    items = auth_items() if auth else list(json.load(sys.stdin).items())
    for locale in locales:
        t0 = time.time()
        res = await warm_locale(locale, items)
        print({**res, "sec": round(time.time() - t0)}, flush=True)


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1:]))
