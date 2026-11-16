"""POST /graph/lab/{id}/what-if. Владелец гипотезы видит полный расчёт. Остальные участники и посторонние видят
только сдвиг сигнала от наблюдений лаборатории: уровень и абсолютный сигнал зависят от скрытых данных автора."""
import pytest

from app.db.session import AsyncSessionLocal
from app.models.entities import Hypothesis, Observation, Link
from tests.conftest import create_test_user, add_lab_member

pytestmark = pytest.mark.asyncio


async def _login(client, username):
    r = await client.post("/api/v1/auth/login", json={"username": username, "password": "pass12345"})
    assert r.status_code == 200, r.text


async def _create_lab(client, name, is_public=False):
    r = await client.post("/api/v1/labs", json={
        "name": name, "is_public": is_public, "goal_type": "task", "new_goal_title": f"Goal {name}"})
    assert r.status_code == 200, r.text
    return r.json()["id"]


async def _add_obs(db, uid, hid, tag, lab_id, importance=5):
    o = Observation(user_id=uid, date="2026-01-02", author="t", title=f"O-{tag}", slug=f"o-{tag}",
                    text="x", importance=importance, lab_id=lab_id,
                    visibility="lab" if lab_id else "private")
    db.add(o)
    await db.flush()
    db.add(Link(user_id=uid, from_type="observation", from_id=o.id, to_type="hypothesis",
                to_id=hid, link_type="подтверждает"))
    return o.id


async def _scenario(client, tag, is_public=False):
    """Владелец (остаётся залогиненным) + лаборатория; гипотеза лабы с лабораторным и приватным наблюдением; гипотеза вне лабы."""
    owner = await create_test_user(f"{tag}_owner")
    await _login(client, owner.username)
    lab_id = await _create_lab(client, f"Lab {tag}", is_public)
    async with AsyncSessionLocal() as db:
        h = Hypothesis(user_id=owner.id, name=f"HL-{tag}", slug=f"hl-{tag}", date_created="2026-01-01",
                       evidence_signal=1.9, risk=0, lab_id=lab_id, visibility="lab")
        outside = Hypothesis(user_id=owner.id, name=f"HP-{tag}", slug=f"hp-{tag}", date_created="2026-01-01",
                             evidence_signal=1.9, risk=0)
        db.add_all([h, outside])
        await db.flush()
        lab_obs = await _add_obs(db, owner.id, h.id, f"{tag}-lab", lab_id)
        priv_obs = await _add_obs(db, owner.id, h.id, f"{tag}-priv", None)
        await _add_obs(db, owner.id, outside.id, f"{tag}-out", None)
        await db.commit()
        return owner, lab_id, h.id, lab_obs, priv_obs


async def _as_member(client, tag, lab_id):
    m = await create_test_user(f"{tag}_member")
    await add_lab_member(lab_id, m.id)
    await _login(client, m.username)


def _url(lab_id):
    return f"/api/v1/graph/lab/{lab_id}/what-if"


async def test_member_gets_only_signal_delta_and_no_private_data(client):
    _, lab_id, hid, lab_obs, priv_obs = await _scenario(client, "wl1")
    await _as_member(client, "wl1", lab_id)
    r = await client.post(_url(lab_id), json={})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["scope"] == "lab_visible"
    (h,) = body["hypotheses"]                      # гипотеза вне лабы не попала
    assert h["eid"] == hid and h["full"] is False and h["verdict"] == "unknown"
    assert h["observation_count"] == 1             # приватное наблюдение владельца не посчитано
    assert h["load_bearing"] == [] and h["level_before"] is None and h["level_after"] is None
    assert "signal_before" not in h and "signal_after" not in h


async def test_member_excluding_lab_observation_shifts_signal_down(client):
    _, lab_id, _, lab_obs, _ = await _scenario(client, "wl2")
    await _as_member(client, "wl2", lab_id)
    (h,) = (await client.post(_url(lab_id), json={"exclude_observation_ids": [lab_obs]})).json()["hypotheses"]
    assert h["affected"] is True and h["direction"] == "down" and h["signal_delta"] == pytest.approx(-0.3)


async def test_member_excluding_private_observation_id_changes_nothing(client):
    _, lab_id, _, _, priv_obs = await _scenario(client, "wl3")
    await _as_member(client, "wl3", lab_id)
    (h,) = (await client.post(_url(lab_id), json={"exclude_observation_ids": [priv_obs]})).json()["hypotheses"]
    assert h["affected"] is False and h["signal_delta"] == 0 and h["direction"] == "none"


async def test_owner_gets_full_calculation(client):
    _, lab_id, _, lab_obs, priv_obs = await _scenario(client, "wl6")
    (h,) = (await client.post(_url(lab_id), json={"exclude_observation_ids": [lab_obs, priv_obs]})).json()["hypotheses"]
    assert h["full"] is True and h["observation_count"] == 2          # владелец видит и своё приватное
    assert (h["level_before"], h["level_after"], h["verdict"]) == (1, 0, "weakened")


async def test_outsider_gets_403_in_private_lab(client):
    _, lab_id, *_ = await _scenario(client, "wl4")
    stranger = await create_test_user("wl4_stranger")
    await _login(client, stranger.username)
    assert (await client.post(_url(lab_id), json={})).status_code == 403


async def test_public_lab_outsider_gets_delta_only(client):
    _, lab_id, *_ = await _scenario(client, "wl5", is_public=True)
    stranger = await create_test_user("wl5_stranger")
    await _login(client, stranger.username)
    r = await client.post(_url(lab_id), json={})
    assert r.status_code == 200, r.text
    (h,) = r.json()["hypotheses"]
    assert h["full"] is False and h["observation_count"] == 1 and h["load_bearing"] == []


async def test_requires_auth(client):
    r = await client.post("/api/v1/graph/lab/1/what-if", json={})
    assert r.status_code in (401, 403), r.text
