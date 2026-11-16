"""Этап 3: метка эффекта для участников лаборатории. effect["lab"] видят владелец и участники;
личная часть (kind/value с калибровкой владельца) остаётся только владельцу."""
import pytest

from tests.conftest import create_test_user
from tests.test_lab_signal import _close, _login
from tests.test_lab_maturity import _contribution
from tests.test_lab_maturity_votes import _setup, _obs, _vote, OBSERVATION_WEIGHT
from tests.test_link_effect import _related


def _by_id(items):
    return {i["id"]: i for i in items}


@pytest.mark.asyncio
async def test_member_sees_lab_effect_of_own_prediction(client):
    owner, (b,), lab, h = await _setup(client, "le1", 1)
    await _login(client, b.username)
    p = await _close(client, h, lab, "подтвердился", 10)
    c = await _contribution(p)
    e = _by_id((await _related(client, "hypothesis", h))["prediction"])[p]["effect"]
    assert e is not None and e["lab"]["value"] == pytest.approx(c)
    assert e["lab"]["mine"] == pytest.approx(c)          # это его прогноз
    assert e.get("value") is None                          # личная часть владельца участнику не отдаётся


@pytest.mark.asyncio
async def test_other_member_sees_total_but_not_as_mine(client):
    owner, (b, c2), lab, h = await _setup(client, "le2", 2)
    await _login(client, b.username)
    p = await _close(client, h, lab, "подтвердился", 10)
    c = await _contribution(p)
    await _login(client, c2.username)
    e = _by_id((await _related(client, "hypothesis", h))["prediction"])[p]["effect"]
    assert e["lab"]["value"] == pytest.approx(c) and e["lab"]["mine"] == 0.0
    assert e.get("value") is None


@pytest.mark.asyncio
async def test_owner_sees_lab_effect_and_personal_part(client):
    owner, (b,), lab, h = await _setup(client, "le3", 1)
    await _login(client, b.username)
    p = await _close(client, h, lab, "подтвердился", 10)
    c = await _contribution(p)
    await _login(client, owner.username)
    e = _by_id((await _related(client, "hypothesis", h))["prediction"])[p]["effect"]
    assert e["lab"]["value"] == pytest.approx(c) and e["lab"]["mine"] == 0.0
    assert e["kind"] == "counted" and e["value"] == 0.0     # личный сигнал чужим прогнозом не двигается


@pytest.mark.asyncio
async def test_observation_lab_effect_has_votes_summary(client):
    owner, (b, c2, d), lab, h = await _setup(client, "le4", 3)
    await _login(client, b.username)
    o = await _obs(client, lab)
    await _vote(client, o, h, "подтверждает")
    await _login(client, c2.username)
    await _vote(client, o, h, "подтверждает")
    await _login(client, d.username)
    await _vote(client, o, h, "опровергает")
    e = _by_id((await _related(client, "hypothesis", h))["observation"])[o]["effect"]
    assert e["lab"]["value"] == pytest.approx(OBSERVATION_WEIGHT / 3)
    assert e["lab"]["votes"]["n"] == 3
    assert e["lab"]["votes"]["mean"] == pytest.approx(1 / 3)
    assert e["lab"]["mine"] == 0.0                         # наблюдение чужое


@pytest.mark.asyncio
async def test_outsider_gets_no_lab_effect(client):
    """ОХРАННЫЙ (зелёный и до патча): не участник лаборатории эффекта не видит."""
    owner, (b,), lab, h = await _setup(client, "le5", 1)
    await _login(client, b.username)
    await _close(client, h, lab, "подтвердился", 10)
    x = await create_test_user("le5_x")
    await _login(client, x.username)
    r = await client.get(f"/api/v1/graph/related/hypothesis/{h}")
    assert r.status_code != 200 or all(
        i.get("effect") is None for items in r.json()["related"].values() for i in items)
