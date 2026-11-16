"""Общая память на запрос (memo) в services/hypothesis_evidence.py и в GET /labs/{id}/signal."""
import pytest

from app.db.session import AsyncSessionLocal
from app.models.entities import Hypothesis
from app.services.hypothesis_evidence import OBSERVATION_WEIGHT, foreign_observation_signal
from tests.test_lab_signal import _login
from tests.test_lab_maturity import _hyp
from tests.test_lab_maturity_votes import _setup, _obs, _vote


@pytest.mark.asyncio
async def test_memo_keeps_details_cached_by_a_call_without_details(client):
    """Первый вызов без details (как в lab_total_signal) кладёт в память и число, и голоса: второй вызов с details их не теряет."""
    owner, (b,), lab, h = await _setup(client, "mm1", 1)
    await _login(client, b.username)
    o = await _obs(client, lab)
    await _vote(client, o, h, "подтверждает")
    async with AsyncSessionLocal() as db:
        hyp = await db.get(Hypothesis, h)
        plain = dict()
        expected = await foreign_observation_signal(db, hyp, plain)        # без memo: прежний боевой путь
        memo = dict()
        v1 = await foreign_observation_signal(db, hyp, memo=memo)
        details = dict()
        v2 = await foreign_observation_signal(db, hyp, details, memo=memo)
    assert plain and expected == pytest.approx(OBSERVATION_WEIGHT)         # контроль: голоса есть
    assert v1 == pytest.approx(expected) and v2 == pytest.approx(expected)
    assert details == plain


@pytest.mark.asyncio
async def test_memo_does_not_mix_hypotheses(client):
    """Одна память на две гипотезы лаборатории: у второй голосов нет, число не должно прийти от первой."""
    owner, (b,), lab, h1 = await _setup(client, "mm2", 1)
    h2 = await _hyp(client, lab)
    await _login(client, b.username)
    o = await _obs(client, lab)
    await _vote(client, o, h1, "подтверждает")
    memo = dict()
    async with AsyncSessionLocal() as db:
        a = await foreign_observation_signal(db, await db.get(Hypothesis, h1), memo=memo)
        c = await foreign_observation_signal(db, await db.get(Hypothesis, h2), memo=memo)
    assert a == pytest.approx(OBSERVATION_WEIGHT)
    assert c == 0.0


@pytest.mark.asyncio
async def test_memo_does_not_live_between_requests(client):
    """ОХРАННЫЙ (зелёный и до патча: общей памяти ещё нет). Две сводки подряд, между ними голос участника:
    вторая сводка обязана его увидеть, значит память не живёт дольше одного запроса."""
    owner, (b,), lab, h = await _setup(client, "mm3", 1)

    async def lab_total():
        r = await client.get(f"/api/v1/labs/{lab}/signal")
        assert r.status_code == 200, r.text
        return next(x for x in r.json()["hypotheses"] if x["id"] == h)["lab_total"]

    before = await lab_total()
    await _login(client, b.username)
    o = await _obs(client, lab)
    await _vote(client, o, h, "подтверждает")
    await _login(client, owner.username)
    after = await lab_total()
    assert before == 0.0
    assert after == pytest.approx(OBSERVATION_WEIGHT)
