"""Глобальный граф: POST /graph/global/what-if и GET /graph/global/blind-spots."""
import pytest

from app.db.session import AsyncSessionLocal
from app.models.entities import Hypothesis, Observation, Link
from tests.conftest import create_test_user

pytestmark = pytest.mark.asyncio


async def _login(client, uname):
    r = await client.post("/api/v1/auth/login", json={"username": uname, "password": "pass12345"})
    assert r.status_code == 200, r.text


def _obs(uid, tag, visibility, importance=5):
    return Observation(user_id=uid, date="2026-01-02", author="t", title=f"O-{tag}", slug=f"o-{tag}",
                       text="x", importance=importance, visibility=visibility)


def _link(uid, oid, hid, ltype="подтверждает"):
    return Link(user_id=uid, from_type="observation", from_id=oid, to_type="hypothesis", to_id=hid, link_type=ltype)


async def _what_if_data(tag):
    owner = await create_test_user(f"{tag}_owner")
    async with AsyncSessionLocal() as db:
        h = Hypothesis(user_id=owner.id, name=f"HG-{tag}", slug=f"hg-{tag}", date_created="2026-01-01",
                       evidence_signal=1.9, risk=0, visibility="public")
        hidden = Hypothesis(user_id=owner.id, name=f"PG-{tag}", slug=f"pg-{tag}", date_created="2026-01-01",
                            evidence_signal=1.9, risk=0)
        db.add_all([h, hidden])
        await db.flush()
        pub, priv = _obs(owner.id, f"{tag}-pub", "public"), _obs(owner.id, f"{tag}-priv", "private")
        db.add_all([pub, priv])
        await db.flush()
        db.add_all([_link(owner.id, pub.id, h.id), _link(owner.id, priv.id, h.id), _link(owner.id, pub.id, hidden.id)])
        await db.commit()
        return owner, h.id, pub.id, priv.id


URL = "/api/v1/graph/global/what-if"


async def test_what_if_requires_auth(client):
    assert (await client.post(URL, json={})).status_code in (401, 403)


async def test_viewer_sees_delta_only_from_public_observations(client):
    _, hid, pub, priv = await _what_if_data("gw1")
    viewer = await create_test_user("gw1_viewer")
    await _login(client, viewer.username)
    rows = (await client.post(URL, json={})).json()["hypotheses"]
    assert [r["name"] for r in rows] == ["HG-gw1"]                     # приватная гипотеза не попала
    (h,) = rows
    assert h["node_id"] == f"hypothesis_{hid}"
    assert h["full"] is False and h["verdict"] == "unknown" and h["observation_count"] == 1
    assert h["load_bearing"] == [] and h["level_before"] is None
    assert "signal_before" not in h and "signal_after" not in h


async def test_viewer_exclusions(client):
    _, _, pub, priv = await _what_if_data("gw2")
    viewer = await create_test_user("gw2_viewer")
    await _login(client, viewer.username)
    (h,) = (await client.post(URL, json={"exclude_observation_ids": [pub]})).json()["hypotheses"]
    assert h["affected"] is True and h["direction"] == "down" and h["signal_delta"] == pytest.approx(-0.3)
    (h,) = (await client.post(URL, json={"exclude_observation_ids": [priv]})).json()["hypotheses"]
    assert h["affected"] is False and h["signal_delta"] == 0


async def test_owner_gets_full_calculation_with_private_observations(client):
    owner, hid, pub, priv = await _what_if_data("gw3")
    await _login(client, owner.username)
    (h,) = (await client.post(URL, json={"exclude_observation_ids": [pub, priv]})).json()["hypotheses"]
    assert h["full"] is True and h["observation_count"] == 2
    assert (h["level_before"], h["level_after"], h["verdict"]) == (1, 0, "weakened")


BS = "/api/v1/graph/global/blind-spots"


async def test_blind_spots_requires_auth(client):
    assert (await client.get(BS)).status_code in (401, 403)


async def test_blind_spots_use_public_data_only(client):
    u = await create_test_user("gb_owner")
    async with AsyncSessionLocal() as db:
        pub_h = Hypothesis(user_id=u.id, name="PubH", slug="gb-ph", date_created="2026-01-01", visibility="public")
        priv_h = Hypothesis(user_id=u.id, name="PrivH", slug="gb-vh", date_created="2026-01-01")
        db.add_all([pub_h, priv_h])
        await db.flush()
        o1, o2, o3, o4 = (_obs(u.id, "gb1", "public"), _obs(u.id, "gb2", "public"),
                          _obs(u.id, "gb3", "public"), _obs(u.id, "gb4", "private"))
        db.add_all([o1, o2, o3, o4])
        await db.flush()
        db.add_all([_link(u.id, o1.id, pub_h.id, "связано"), _link(u.id, o2.id, priv_h.id, "связано")])
        await db.commit()
        ph, ids = pub_h.id, (o1.id, o2.id, o3.id, o4.id)
    viewer = await create_test_user("gb_viewer")
    await _login(client, viewer.username)
    r = await client.get(BS)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["scope"] == "public"
    by = lambda rule: sorted(x["node_id"] for x in body["items"] if x["rule"] == rule)
    assert by("no_falsification") == [f"hypothesis_{ph}"]              # приватной гипотезы нет
    # o1 связан с публичной гипотезой; o2 только с приватной; o3 без связей; o4 приватное и не показывается
    assert by("observation_orphan") == sorted([f"observation_{ids[1]}", f"observation_{ids[2]}"])
