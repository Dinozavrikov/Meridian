"""POST /graph/what-if: реальные запросы. Расчёт уровней проверен в test_what_if.py, здесь доступ,
фильтры и форма ответа."""
from datetime import datetime, timezone

import pytest

from app.db.session import AsyncSessionLocal
from app.models.entities import Hypothesis, Observation, Link
from tests.conftest import create_test_user

pytestmark = pytest.mark.asyncio
URL = "/api/v1/graph/what-if"


async def _hyp_with_obs(uname, signal=1.9, risk=0, deleted_hyp=False):
    """Гипотеза с одним подтверждающим наблюдением важности 5: полный сигнал signal+0.3."""
    u = await create_test_user(uname)
    async with AsyncSessionLocal() as db:
        h = Hypothesis(user_id=u.id, name=f"H-{uname}", slug=f"h-{uname}", date_created="2026-01-01",
                       evidence_signal=signal, risk=risk,
                       deleted_at=datetime.now(timezone.utc) if deleted_hyp else None)
        db.add(h)
        await db.flush()
        o = Observation(user_id=u.id, date="2026-01-02", author="t", title="O", slug=f"o-{uname}",
                        text="x", importance=5)
        db.add(o)
        await db.flush()
        db.add(Link(user_id=u.id, from_type="observation", from_id=o.id, to_type="hypothesis",
                    to_id=h.id, link_type="подтверждает"))
        await db.commit()
        return u.username, h.id, o.id


async def _login(client, uname):
    r = await client.post("/api/v1/auth/login", json={"username": uname, "password": "pass12345"})
    assert r.status_code == 200, r.text


async def test_requires_auth(client):
    r = await client.post(URL, json={"exclude_observation_ids": []})
    assert r.status_code in (401, 403), r.text


async def test_excluding_decisive_observation_weakens(client):
    uname, hid, oid = await _hyp_with_obs("wi_weak")
    await _login(client, uname)
    r = await client.post(URL, json={"exclude_observation_ids": [oid]})
    assert r.status_code == 200, r.text
    (h,) = r.json()["hypotheses"]
    assert (h["node_id"], h["eid"]) == (f"h_{hid}", hid)
    assert (h["level_before"], h["level_after"], h["verdict"]) == (1, 0, "weakened")
    assert h["load_bearing"] == [f"o_{oid}"]


async def test_no_exclusion_holds_but_reports_load_bearing(client):
    uname, hid, oid = await _hyp_with_obs("wi_hold")
    await _login(client, uname)
    (h,) = (await client.post(URL, json={})).json()["hypotheses"]
    assert h["verdict"] == "held"
    assert h["load_bearing"] == [f"o_{oid}"]


async def test_unknown_observation_id_is_harmless(client):
    uname, _, _ = await _hyp_with_obs("wi_unk")
    await _login(client, uname)
    (h,) = (await client.post(URL, json={"exclude_observation_ids": [999999]})).json()["hypotheses"]
    assert h["verdict"] == "held"


async def test_hypothesis_without_evidence_is_omitted(client):
    u = await create_test_user("wi_empty")
    async with AsyncSessionLocal() as db:
        db.add(Hypothesis(user_id=u.id, name="Пустая", slug="wi-empty", date_created="2026-01-01"))
        await db.commit()
    await _login(client, u.username)
    assert (await client.post(URL, json={})).json() == {"hypotheses": []}


async def test_other_users_hypotheses_not_visible(client):
    await _hyp_with_obs("wi_owner")
    other, _, _ = await _hyp_with_obs("wi_other")
    await _login(client, other)
    names = [h["name"] for h in (await client.post(URL, json={})).json()["hypotheses"]]
    assert names == ["H-wi_other"]


async def test_trashed_hypothesis_is_omitted(client):
    uname, _, _ = await _hyp_with_obs("wi_trash", deleted_hyp=True)
    await _login(client, uname)
    assert (await client.post(URL, json={})).json() == {"hypotheses": []}


async def test_too_many_ids_is_422(client):
    uname, _, _ = await _hyp_with_obs("wi_big")
    await _login(client, uname)
    r = await client.post(URL, json={"exclude_observation_ids": list(range(1001))})
    assert r.status_code == 422, r.text
