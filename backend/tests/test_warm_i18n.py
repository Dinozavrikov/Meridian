"""Скрипт прогрева кэша переводов: пачки и подсчёт результата."""
from types import SimpleNamespace

import pytest

from scripts.warm_i18n import warm_locale


@pytest.mark.asyncio
async def test_warm_locale_uses_chunks_and_counts_failures():
    calls = []

    async def fake(db, locale, strings):
        calls.append(list(strings))
        return SimpleNamespace(translations={}, missing=[k for k in strings if k.startswith("bad")])

    items = [("a1", "x"), ("bad1", "x"), ("a2", "x"), ("bad2", "x"), ("a3", "x")]
    res = await warm_locale("en", items, chunk=2, ensure=fake)
    assert res == {"locale": "en", "ok": 3, "failed": 2}
    assert [len(c) for c in calls] == [2, 2, 1]
