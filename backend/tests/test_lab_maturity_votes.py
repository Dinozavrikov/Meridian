"""Этап 2: наблюдения участников лаборатории в сигнале (правило V3): наблюдение считается ОДИН раз,
голоса участников усредняются; связи владельца гипотезы в часть лаборатории не входят."""
import pytest

from tests.conftest import add_lab_member, create_test_user
from tests.test_lab_signal import _close, _lab, _login
from tests.test_lab_maturity import _hyp, _pending, _contribution
from app.db.session import AsyncSessionLocal
from app.models.entities import Hypothesis
from app.services.hypothesis_evidence import OBSERVATION_WEIGHT, maturity_signal


async def _obs(client, lab_id, importance=5, title="Н"):
    r = await client.post("/api/v1/observations/", json={
        "date": "2026-08-06", "author": "а", "title": title, "text": "т", "importance": importance,
        "visibility": "lab" if lab_id else "private", "lab_id": lab_id})
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


async def _vote(client, o, h, link_type):
    r = await client.post("/api/v1/graph/links", params={"share": "lab", 
        "from_type": "observation", "from_id": o, "to_type": "hypothesis", "to_id": h, "link_type": link_type})
    assert r.status_code == 200, r.text


async def _parts(h):
    """(прогнозы владельца, наблюдения владельца, лаборатория, сумма)"""
    async with AsyncSessionLocal() as db:
        return await maturity_signal(db, await db.get(Hypothesis, h))


async def _setup(client, tag, n_members):
    owner = await create_test_user(f"lv_{tag}_o")
    members = [await create_test_user(f"lv_{tag}_m{i}") for i in range(n_members)]
    await _login(client, owner.username)
    lab = await _lab(client, f"lv-lab-{tag}")
    for m in members:
        await add_lab_member(lab, m.id, "member")
    return owner, members, lab, await _hyp(client, lab)


@pytest.mark.asyncio
async def test_member_vote_on_own_lab_observation_counts(client):
    _, (b,), lab, h = await _setup(client, "1", 1)
    await _login(client, b.username)
    o = await _obs(client, lab)
    await _vote(client, o, h, "подтверждает")
    own_pred, own_obs, lab_part, _ = await _parts(h)
    assert own_obs == 0.0 and own_pred == 0.0       # контроль: личные части владельца не тронуты
    assert lab_part == pytest.approx(OBSERVATION_WEIGHT)   # 5/5 * 0.3; сегодня 0


@pytest.mark.asyncio
async def test_same_observation_voted_by_three_counts_once(client):
    _, (b, c, d), lab, h = await _setup(client, "2", 3)
    await _login(client, b.username)
    o = await _obs(client, lab)
    for m in (b, c, d):
        await _login(client, m.username)
        await _vote(client, o, h, "подтверждает")
    assert (await _parts(h))[2] == pytest.approx(OBSERVATION_WEIGHT)   # не 3 * 0.3


@pytest.mark.asyncio
async def test_disputed_observation_is_averaged(client):
    _, (b, c, d), lab, h = await _setup(client, "3", 3)
    await _login(client, b.username)
    o = await _obs(client, lab)
    await _vote(client, o, h, "подтверждает")
    await _login(client, c.username)
    await _vote(client, o, h, "подтверждает")
    await _login(client, d.username)
    await _vote(client, o, h, "опровергает")
    assert (await _parts(h))[2] == pytest.approx(OBSERVATION_WEIGHT / 3)   # среднее (+1+1-1)/3


@pytest.mark.asyncio
async def test_owner_linked_observation_is_not_counted_twice(client):
    """ОХРАННЫЙ (зелёный и до патча): связь владельца уже в «своём» сигнале, лаборатория её пропускает."""
    owner, (b, c), lab, h = await _setup(client, "4", 2)
    await _login(client, b.username)
    o = await _obs(client, lab)
    await _vote(client, o, h, "подтверждает")
    await _login(client, c.username)
    await _vote(client, o, h, "подтверждает")
    await _login(client, owner.username)
    await _vote(client, o, h, "подтверждает")
    _, own_obs, lab_part, _ = await _parts(h)
    assert own_obs == pytest.approx(OBSERVATION_WEIGHT)    # контроль: у владельца наблюдение посчитано
    assert lab_part == 0.0


@pytest.mark.asyncio
async def test_observation_outside_the_lab_is_not_counted(client):
    """ОХРАННЫЙ (зелёный и до патча): личное наблюдение участника (без lab_id) в сигнал лаборатории не идёт."""
    _, (b,), lab, h = await _setup(client, "5", 1)
    await _login(client, b.username)
    o = await _obs(client, None)
    await _vote(client, o, h, "подтверждает")
    assert (await _parts(h))[2] == 0.0


@pytest.mark.asyncio
async def test_member_link_recomputes_owners_suggestion(client):
    _, (b,), lab, h = await _setup(client, "6", 1)
    await _login(client, b.username)
    p = await _close(client, h, lab, "подтвердился", 10)
    c = await _contribution(p)
    assert c >= 2.0 and len(await _pending(h)) == 1        # контроль: предложение уже есть
    o = await _obs(client, lab)
    await _vote(client, o, h, "подтверждает")
    sugs = await _pending(h)
    assert len(sugs) == 1
    assert sugs[0].raw_signal == pytest.approx(c + OBSERVATION_WEIGHT)   # сегодня остаётся c: нет пересчёта
