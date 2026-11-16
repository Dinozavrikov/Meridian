"""Слепые зоны: чистая функция (правила) и эндпоинты (доступ, корзина, утечки)."""
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace as NS

import pytest

from app.db.session import AsyncSessionLocal
from app.models.entities import Hypothesis, Observation, Prediction, Link
from app.services.blind_spots import find_blind_spots
from tests.conftest import create_test_user, add_lab_member

NOW = datetime(2026, 10, 13, tzinfo=timezone.utc)
OPEN = "не проверен"


def _h(i, crit="критерий"): return NS(id=i, name=f"H{i}", falsification_criteria=crit)
def _p(i, hid=None, status=OPEN, days=-1):
    return NS(id=i, hypothesis_id=hid, status=status, expected_check_date=NOW + timedelta(days=days), text=f"P{i}")
def _o(i): return NS(id=i, title=f"O{i}")


def _rules(items, rule): return sorted(x["node_id"] for x in items if x["rule"] == rule)


def _run(hyps=(), preds=(), obs=(), links=(), ev=None, keys=None):
    return find_blind_spots(list(hyps), list(preds), list(obs), list(links), ev or {}, NOW, OPEN, keys)


def test_no_falsification_blank_and_whitespace():
    r = _run([_h(1, ""), _h(2, "  \n"), _h(3)])
    assert _rules(r, "no_falsification") == ["h_1", "h_2"]


def test_only_confirmations():
    ev = {1: [(1, 1, 5)], 2: [(2, 1, 5), (3, -1, 1)], 3: [(4, -1, 5)], 4: []}
    r = _run([_h(1), _h(2), _h(3), _h(4)], ev=ev)
    assert _rules(r, "only_confirmations") == ["h_1"]


def test_no_predictions_counts_any_status():
    r = _run([_h(1), _h(2)], preds=[_p(1, hid=1, status="подтвердился")])
    assert _rules(r, "no_predictions") == ["h_2"]


def test_prediction_overdue_only_open_and_past():
    r = _run(preds=[_p(1), _p(2, days=5), _p(3, status="подтвердился")])
    assert _rules(r, "prediction_overdue") == ["p_1"]


def test_orphan_observation_and_node_keys_restriction():
    assert _rules(_run(obs=[_o(1), _o(2)], links=[("o_1", "h_9")]), "observation_orphan") == ["o_2"]
    # лаборатория: связь с записью вне лаборатории не считается
    r = _run(obs=[_o(1), _o(2)], links=[("o_1", "h_9"), ("o_2", "h_1")], keys={"o_1", "o_2", "h_1"})
    assert _rules(r, "observation_orphan") == ["o_1"]


pytestmark_api = pytest.mark.asyncio


async def _login(client, uname):
    r = await client.post("/api/v1/auth/login", json={"username": uname, "password": "pass12345"})
    assert r.status_code == 200, r.text


@pytest.mark.asyncio
async def test_personal_endpoint_rules_isolation_and_trash(client):
    me = await create_test_user("bs_me")
    other = await create_test_user("bs_other")
    past = datetime.now(timezone.utc) - timedelta(days=3)
    async with AsyncSessionLocal() as db:
        h = Hypothesis(user_id=me.id, name="Моя", slug="bs-h", date_created="2026-01-01")
        gone = Hypothesis(user_id=me.id, name="Удалена", slug="bs-g", date_created="2026-01-01",
                          deleted_at=datetime.now(timezone.utc))
        foreign = Hypothesis(user_id=other.id, name="Чужая", slug="bs-f", date_created="2026-01-01")
        o = Observation(user_id=me.id, date="2026-01-02", author="t", title="Сирота", slug="bs-o", text="x")
        db.add_all([h, gone, foreign, o]); await db.flush()
        db.add(Prediction(user_id=me.id, text="Старый", slug="bs-p", date_created="2026-01-01",
                          expected_check_date=past, hypothesis_id=h.id))
        await db.commit()
        hid, oid = h.id, o.id
    await _login(client, me.username)
    r = await client.get("/api/v1/graph/blind-spots")
    assert r.status_code == 200, r.text
    items = r.json()["items"]
    by = lambda rule: sorted(x["node_id"] for x in items if x["rule"] == rule)
    assert by("no_falsification") == [f"h_{hid}"]          # ни чужой, ни удалённой
    assert by("no_predictions") == []                        # у гипотезы есть прогноз
    assert len(by("prediction_overdue")) == 1
    assert by("observation_orphan") == [f"o_{oid}"]


@pytest.mark.asyncio
async def test_requires_auth(client):
    assert (await client.get("/api/v1/graph/blind-spots")).status_code in (401, 403)


async def _lab(client, owner, is_public=False):
    await _login(client, owner.username)
    r = await client.post("/api/v1/labs", json={"name": f"L-{owner.username}", "is_public": is_public,
                                                "goal_type": "task", "new_goal_title": "G"})
    assert r.status_code == 200, r.text
    return r.json()["id"]


@pytest.mark.asyncio
async def test_lab_endpoint_scope_no_private_leak_and_access(client):
    owner = await create_test_user("bsl_owner")
    lab_id = await _lab(client, owner)
    async with AsyncSessionLocal() as db:
        lab_h = Hypothesis(user_id=owner.id, name="LabH", slug="bsl-h", date_created="2026-01-01",
                           lab_id=lab_id, visibility="lab")
        private_h = Hypothesis(user_id=owner.id, name="PrivH", slug="bsl-ph", date_created="2026-01-01")
        lab_o = Observation(user_id=owner.id, date="2026-01-02", author="t", title="LabO", slug="bsl-o",
                            text="x", lab_id=lab_id, visibility="lab")
        priv_o = Observation(user_id=owner.id, date="2026-01-02", author="t", title="PrivO", slug="bsl-po", text="x")
        db.add_all([lab_h, private_h, lab_o, priv_o]); await db.flush()
        # лабораторное наблюдение связано только с приватной гипотезой: в лаборатории оно сирота
        db.add(Link(user_id=owner.id, from_type="observation", from_id=lab_o.id, to_type="hypothesis",
                    to_id=private_h.id, link_type="связано"))
        await db.commit()
        lab_h_id, lab_o_id, priv_o_id = lab_h.id, lab_o.id, priv_o.id
    member = await create_test_user("bsl_member")
    await add_lab_member(lab_id, member.id)
    await _login(client, member.username)
    r = await client.get(f"/api/v1/graph/lab/{lab_id}/blind-spots")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["scope"] == "lab_visible"
    ids = {x["node_id"] for x in body["items"]}
    assert f"h_{lab_h_id}" in ids and f"o_{lab_o_id}" in ids        # сирота в рамках лаборатории
    assert f"o_{priv_o_id}" not in ids                              # приватное не светится
    assert all(x["label"] != "PrivH" for x in body["items"])

    stranger = await create_test_user("bsl_stranger")
    await _login(client, stranger.username)
    assert (await client.get(f"/api/v1/graph/lab/{lab_id}/blind-spots")).status_code == 403
