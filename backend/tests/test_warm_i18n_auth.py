import uuid

import pytest

from app.core.auth_ui_strings import AUTH_UI_STRINGS
from app.db.session import AsyncSessionLocal
from app.models.i18n import UIStringTranslation
from scripts.warm_i18n import auth_items, cached_locales


def test_auth_items_cover_the_whole_whitelist_with_key_equal_to_text():
    items = dict(auth_items())
    assert set(items) == set(AUTH_UI_STRINGS) and len(items) > 10
    assert all(k == v for k, v in items.items())


@pytest.mark.asyncio
async def test_cached_locales_come_from_the_database():
    loc = "t" + uuid.uuid4().hex[:8]
    async with AsyncSessionLocal() as db:
        row = UIStringTranslation(key="k-" + loc, source_hash="h", target_lang=loc, translated_text="x")
        db.add(row)
        await db.commit()
        rid = row.id
    try:
        assert loc in await cached_locales()
    finally:
        async with AsyncSessionLocal() as db:
            await db.delete(await db.get(UIStringTranslation, rid))
            await db.commit()
