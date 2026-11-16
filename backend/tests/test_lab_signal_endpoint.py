"""GET /labs/{id}/signal: сводка сигнала по гипотезам лаборатории одним запросом (полоска и список вкладов)."""
import pytest

from tests.conftest import create_test_user
from tests.test_lab_signal import _close, _login
from tests.test_lab_maturity import _contribution
from tests.test_lab_maturity_votes import _setup, _obs, _vote, OBSERVATION_WEIGHT


async def _signal(client, lab):
    return await client.get(f"/api/v1/labs/{lab}/signal")


def _hyp(j, h):
    return next(x for x in j["hypotheses"] if x["id"] == h)


@pytest.mark.asyncio
async def test_member_sees_sorted_contributions_with_mine(client):
    owner, (b,), lab, h = await _setup(client, "se1", 1)
    c = await _contribution(await _close(client, h, lab, "подтвердился", 10))   # прогноз владельца
    await _login(client, b.username)
    o = await _obs(client, lab)
    await _vote(client, o, h, "подтверждает")                                    # наблюдение участника
    r = await _signal(client, lab)
    assert r.status_code == 200, r.text                                          # сегодня 404: роута нет
    x = _hyp(r.json(), h)
    assert [i["type"] for i in x["contributions"]] == ["prediction", "observation"]   # по модулю вклада
    assert x["contributions"][0]["value"] == pytest.approx(c)
    obs = x["contributions"][1]
    assert obs["value"] == pytest.approx(OBSERVATION_WEIGHT) and obs["mine"] == pytest.approx(OBSERVATION_WEIGHT)
    assert x["contributions"][0]["mine"] == 0.0                                  # прогноз чужой


@pytest.mark.asyncio
async def test_member_gets_no_personal_numbers(client):
    owner, (b,), lab, h = await _setup(client, "se2", 1)
    await _close(client, h, lab, "подтвердился", 10)
    await _login(client, b.username)
    x = _hyp((await _signal(client, lab)).json(), h)
    for k in ("pred_signal", "obs_signal", "total_signal"):
        assert x.get(k) is None, k
    assert x["next_threshold"] == pytest.approx(2.0) and x["next_level"] == 1


@pytest.mark.asyncio
async def test_owner_gets_personal_numbers(client):
    owner, _, lab, h = await _setup(client, "se3", 0)
    c = await _contribution(await _close(client, h, lab, "подтвердился", 10))
    x = _hyp((await _signal(client, lab)).json(), h)
    assert x["pred_signal"] == pytest.approx(c) and x["total_signal"] == pytest.approx(c)


@pytest.mark.asyncio
async def test_contributions_plus_rest_equal_lab_total(client):
    """Список и полоска не расходятся: включая наблюдение владельца в лабе и личное наблюдение (оно не идёт)."""
    owner, (b,), lab, h = await _setup(client, "se4", 1)
    await _close(client, h, lab, "подтвердился", 10)
    o1 = await _obs(client, lab); await _vote(client, o1, h, "подтверждает")
    o2 = await _obs(client, None); await _vote(client, o2, h, "подтверждает")
    await _login(client, b.username)
    await _close(client, h, lab, "не подтвердился", 80)
    x = _hyp((await _signal(client, lab)).json(), h)
    assert len(x["contributions"]) == 3                                          # 2 прогноза + наблюдение владельца в лабе
    assert sum(i["value"] for i in x["contributions"]) + x["rest"] == pytest.approx(x["lab_total"])


@pytest.mark.asyncio
async def test_outsider_gets_404(client):
    """ОХРАННЫЙ (зелёный и до патча: роута нет)."""
    owner, _, lab, h = await _setup(client, "se5", 0)
    x = await create_test_user("se5_x")
    await _login(client, x.username)
    assert (await _signal(client, lab)).status_code == 404
