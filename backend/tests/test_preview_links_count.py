"""links_count в /preview = число прямых связей, как в заголовке «Связи» менеджера (/graph/related):
считаются Link, связь прогноз -> гипотеза через hypothesis_id и конкурирующие гипотезы."""
import pytest
from tests.conftest import create_test_user


async def _login(client, username, password="pass12345"):
    r = await client.post("/api/v1/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200


async def _hyp(client):
    r = await client.post("/api/v1/hypotheses/", json={"name": "Гипотеза", "description": "d", "date_created": "2026-08-06", "status": "идея", "visibility": "private"})
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


async def _pred(client, hyp_id=None):
    r = await client.post("/api/v1/predictions/", json={"title": "п", "text": "т", "date_created": "2026-08-06",
        "expected_check_date": "2026-12-06T00:00:00", "status": "не проверен", "visibility": "private",
        "confidence": 50, "hypothesis_id": hyp_id})
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


async def _direct(client, etype, eid):
    rel = (await client.get(f"/api/v1/graph/related/{etype}/{eid}")).json()["related"]
    return sum(1 for items in rel.values() for i in items if i["direct"])


async def _count(client, etype, eid):
    return (await client.get(f"/api/v1/{etype}/{eid}/preview")).json()["links_count"]


@pytest.mark.asyncio
async def test_prediction_hypothesis_field_link_is_counted_on_both_sides(client):
    await create_test_user("lc_a")
    await _login(client, "lc_a")
    h = await _hyp(client)
    p = await _pred(client, h)
    assert await _count(client, "hypothesis", h) == 1
    assert await _count(client, "prediction", p) == 1


@pytest.mark.asyncio
async def test_count_matches_manager_for_mixed_links(client):
    await create_test_user("lc_b")
    await _login(client, "lc_b")
    h = await _hyp(client)
    p = await _pred(client, h)
    o = (await client.post("/api/v1/observations/", json={"title": "Т", "date": "2026-09-23", "author": "a", "text": "x",
                                                          "lab_id": None, "visibility": "private", "tags": []})).json()["id"]
    await client.post(f"/api/v1/graph/links?from_type=observation&from_id={o}&to_type=hypothesis&to_id={h}&link_type=связано")
    # то же отношение дважды (поле и ссылка) не удваивает счёт
    await client.post(f"/api/v1/graph/links?from_type=prediction&from_id={p}&to_type=hypothesis&to_id={h}&link_type=связано")
    for etype, eid in (("hypothesis", h), ("prediction", p), ("observation", o)):
        assert await _count(client, etype, eid) == await _direct(client, etype, eid), etype
    assert await _count(client, "hypothesis", h) == 2
