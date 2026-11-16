"""ОХРАННЫЙ (на старом коде зелёный по построению): ответ GET /labs/{id}/signal с общей памятью равен прямым вызовам
функций БЕЗ памяти. Две гипотезы с РАЗНЫМИ владельцами в одной лаборатории (ключ набора голосующих), прогноз из корзины,
окончательно удалённый (остаток), спор голосов, личное наблюдение. Смотрят владелец лаборатории, участник и участник без гипотез."""
import pytest

from app.db.session import AsyncSessionLocal
from sqlalchemy import select
from app.models.entities import Hypothesis, Observation
from app.services.hypothesis_evidence import (
    foreign_observation_signal, lab_total_signal, maturity_signal, observation_evidence, signal_from_evidence)
from tests.test_lab_signal import _close, _login
from tests.test_lab_maturity import _hyp
from tests.test_lab_maturity_votes import _setup, _obs, _vote


async def _build_scenario(client):
    owner, (m1, m2), lab, h1 = await _setup(client, "or1", 2)          # h1: владелец лаборатории; сейчас вошёл он
    await _close(client, h1, lab, "подтвердился", 10)
    trashed = await _close(client, h1, lab, "не подтвердился", 60)
    assert (await client.delete("/api/v1/predictions/" + str(trashed))).status_code == 204     # в корзине: остаётся в сигнале
    purged = await _close(client, h1, lab, "не подтвердился", 80)
    assert (await client.delete("/api/v1/predictions/" + str(purged))).status_code == 204
    assert (await client.delete("/api/v1/prediction/" + str(purged) + "/permanent")).status_code == 204   # остаток
    o_own = await _obs(client, lab, title="свое")
    await _vote(client, o_own, h1, "подтверждает")                       # связь владельца: его «свой» сигнал
    o_priv = await _obs(client, None, title="личное")
    await _vote(client, o_priv, h1, "подтверждает")                      # личное: в сигнал лаборатории не идёт
    o_for_h2 = await _obs(client, lab, title="для h2")
    await _login(client, m1.username)
    h2 = await _hyp(client, lab)                                         # h2: владелец УЧАСТНИК m1
    await _close(client, h1, lab, "подтвердился", 30)
    o_m = await _obs(client, lab, title="участник")
    await _vote(client, o_m, h1, "подтверждает")
    o_m2 = await _obs(client, lab, title="участник2")
    await _vote(client, o_m2, h2, "подтверждает")                        # связь владельца h2
    await _login(client, m2.username)
    await _vote(client, o_m, h1, "опровергает")                          # спор: среднее (+1-1)/2
    await _close(client, h2, lab, "подтвердился", 20)
    await _login(client, owner.username)
    await _vote(client, o_for_h2, h2, "подтверждает")                    # голос владельца лаборатории по гипотезе участника
    return lab, h1, h2, owner, m1, m2, o_for_h2


async def _expected(hid):
    async with AsyncSessionLocal() as db:
        hyp = await db.get(Hypothesis, hid)
        total = await lab_total_signal(db, hyp)
        votes = dict()
        await foreign_observation_signal(db, hyp, votes)
        obs = dict()
        for oid, d in votes.items():
            obs[oid] = (d["value"], dict(n=d["n"], mean=d["mean"]))
        for oid, sign, imp in await observation_evidence(db, hyp.user_id, hyp.id):
            obs[oid] = (signal_from_evidence([(oid, sign, imp)]), None)
        # как в сводке: личные наблюдения (без lab_id лаборатории) и удалённые в список не идут
        in_lab = set()
        if obs:
            in_lab = set((await db.execute(select(Observation.id).where(
                Observation.id.in_(list(obs)), Observation.lab_id == hyp.lab_id,
                Observation.deleted_at.is_(None)))).scalars().all())
        obs = dict((k, v) for k, v in obs.items() if k in in_lab)
        personal = await maturity_signal(db, hyp)
        return total, obs, personal, hyp.user_id


@pytest.mark.asyncio
async def test_summary_equals_direct_calls_without_memo(client):
    lab, h1, h2, owner, m1, m2, o_for_h2 = await _build_scenario(client)
    seen_h2_owner_vote = False
    for viewer in (owner, m1, m2):
        await _login(client, viewer.username)
        r = await client.get("/api/v1/labs/" + str(lab) + "/signal")
        assert r.status_code == 200, r.text
        rows = dict((x["id"], x) for x in r.json()["hypotheses"])
        assert set(rows) == set([h1, h2])
        for hid in (h1, h2):
            total, obs, personal, hyp_owner = await _expected(hid)
            x = rows[hid]
            assert x["lab_total"] == pytest.approx(total), (viewer.username, hid)
            got = dict((i["id"], i) for i in x["contributions"] if i["type"] == "observation")
            assert set(got) == set(obs), (viewer.username, hid)
            for oid, (value, votes) in obs.items():
                assert got[oid]["value"] == pytest.approx(value)
                assert got[oid]["votes"] == (None if votes is None else dict(n=votes["n"], mean=pytest.approx(votes["mean"])))
            assert x["rest"] == pytest.approx(total - sum(i["value"] for i in x["contributions"]))
            if hyp_owner == viewer.id:
                assert x["pred_signal"] == pytest.approx(personal[0]) and x["obs_signal"] == pytest.approx(personal[1])
                assert x["total_signal"] == pytest.approx(personal[3])
            else:
                assert x.get("pred_signal") is None and x.get("obs_signal") is None and x.get("total_signal") is None
            if hid == h2 and o_for_h2 in got:
                seen_h2_owner_vote = True
            if hid == h1:
                assert abs(x["rest"]) > 1e-9, "контроль: остаток удалённого прогноза должен быть ненулевым"
            assert abs(total) > 1e-9, "контроль: сценарий не пустой"
    assert seen_h2_owner_vote, "контроль: голос владельца лаборатории по гипотезе участника виден в сводке"
