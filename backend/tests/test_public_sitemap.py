"""GET /feed/public/sitemap: в перечне только публичные неудаленные записи, без текстов и авторов."""
import json
from datetime import datetime, timezone

import pytest

from tests.conftest import create_test_user
from tests.test_feed_groups_api import _create_hyp, _create_lab, _login, _set

URL = "/api/v1/feed/public/sitemap"


async def _listing(client):
    r = await client.get(URL)
    assert r.status_code == 200, r.text
    data = r.json()
    return data, {x["id"] for x in data if x["type"] == "hypothesis"}


@pytest.mark.asyncio
async def test_only_public_alive_records_are_listed(client):
    await create_test_user("sitemap_owner")
    await _login(client, "sitemap_owner")
    pub = await _create_hyp(client, "SITEMAP-PUBLIC-TITLE", visibility="public")
    priv = await _create_hyp(client, "SITEMAP-PRIVATE-TITLE")
    lab = await _create_lab(client, "sitemap lab", False)
    in_lab = await _create_hyp(client, "SITEMAP-LAB-TITLE", visibility="lab", lab_id=lab["id"])
    gone = await _create_hyp(client, "SITEMAP-DELETED-TITLE", visibility="public")
    await _set("hypothesis", gone["id"], deleted_at=datetime.now(timezone.utc))
    data, ids = await _listing(client)
    assert pub["id"] in ids, "предусловие: публичная запись в перечне"
    assert not ({priv["id"], in_lab["id"], gone["id"]} & ids), "приватная, лабораторная или удаленная запись попала в sitemap"
    assert all(set(x) == {"type", "id", "updated_at"} for x in data), "в перечне только тип, id и время"
    assert "SITEMAP-" not in json.dumps(data), "текст записи попал в перечень"


@pytest.mark.asyncio
async def test_record_made_private_leaves_the_sitemap(client):
    await create_test_user("sitemap_owner2")
    await _login(client, "sitemap_owner2")
    rec = await _create_hyp(client, "SITEMAP-FLIP", visibility="public")
    _, before = await _listing(client)
    assert rec["id"] in before
    await _set("hypothesis", rec["id"], visibility="private")
    _, after = await _listing(client)
    assert rec["id"] not in after


@pytest.mark.asyncio
async def test_public_worldview_is_listed_and_private_is_not(client):
    await create_test_user("sitemap_wv")
    await _login(client, "sitemap_wv")
    pub = await client.post("/api/v1/worldview/", json={"date": "2026-11-01", "belief": "SITEMAP-WV-PUBLIC", "visibility": "public"})
    priv = await client.post("/api/v1/worldview/", json={"date": "2026-11-01", "belief": "SITEMAP-WV-PRIVATE", "visibility": "private"})
    assert pub.status_code in (200, 201), pub.text
    assert priv.status_code in (200, 201), priv.text
    data, _ = await _listing(client)
    ids = {x["id"] for x in data if x["type"] == "worldview"}
    assert pub.json()["id"] in ids, "публичное убеждение должно быть в перечне"
    assert priv.json()["id"] not in ids, "приватное убеждение в перечне"
    assert "SITEMAP-WV" not in json.dumps(data), "текст убеждения попал в перечень"
