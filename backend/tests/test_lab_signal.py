"""Совместный сигнал лаборатории (вариант В): вклад закрытого прогноза участника лаборатории на гипотезу этой же
лаборатории пишется в predictions.lab_signal_contribution (замороженно, при закрытии). Личный evidence_signal
чужой вклад по-прежнему не двигает."""
import pytest

from tests.conftest import add_lab_member, create_test_user
from app.db.session import AsyncSessionLocal
from app.models.entities import Hypothesis, Prediction
from app.services.hypothesis_evidence import lab_signal


async def _login(client, username, password="pass12345"):
    r = await client.post("/api/v1/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200, r.text


async def _lab(client, name):
    r = await client.post("/api/v1/labs", json={"name": name, "is_public": False, "open_join": False,
                                                "goal_type": "task", "new_goal_title": f"Goal {name}"})
    assert r.status_code == 200, r.text
    return r.json()["id"]


async def _lab_hyp(client, lab_id):
    r = await client.post("/api/v1/hypotheses/", json={"name": "ЛГ", "description": "d", "date_created": "2026-08-06",
                                                       "status": "идея", "visibility": "lab", "lab_id": lab_id})
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


async def _close(client, hyp_id, lab_id, status="подтвердился", confidence=20):
    r = await client.post("/api/v1/predictions/", params={"share": "lab"}, json={"title": "п", "text": "т", "date_created": "2026-08-06",
        "expected_check_date": "2026-12-06T00:00:00", "status": "не проверен", "visibility": "lab" if lab_id else "private",
        "lab_id": lab_id, "confidence": confidence, "hypothesis_id": hyp_id})
    assert r.status_code in (200, 201), r.text
    pid = r.json()["id"]
    r = await client.put(f"/api/v1/predictions/{pid}/close", json={"status": status, "result_notes": "итог"})
    assert r.status_code == 200, r.text
    return pid


async def _read(h, *pids):
    async with AsyncSessionLocal() as db:
        hyp = await db.get(Hypothesis, h)
        preds = [await db.get(Prediction, p) for p in pids]
        return hyp.evidence_signal, await lab_signal(db, h), [p.lab_signal_contribution for p in preds]


@pytest.mark.asyncio
async def test_member_prediction_moves_lab_signal_not_personal(client):
    owner = await create_test_user("ls_a"); member = await create_test_user("ls_b")
    await _login(client, "ls_a")
    lab = await _lab(client, "ls-lab"); await add_lab_member(lab, member.id, "member")
    h = await _lab_hyp(client, lab)
    await _login(client, "ls_b")
    p = await _close(client, h, lab)
    personal, shared, (saved,) = await _read(h, p)
    assert personal == 0.0                         # чужой вклад личный сигнал владельца не двигает
    assert saved is not None and saved > 0
    assert shared == pytest.approx(saved)


@pytest.mark.asyncio
async def test_lab_signal_sums_owner_and_member_contributions(client):
    owner = await create_test_user("ls_c"); member = await create_test_user("ls_d")
    await _login(client, "ls_c")
    lab = await _lab(client, "ls-lab2"); await add_lab_member(lab, member.id, "member")
    h = await _lab_hyp(client, lab)
    p1 = await _close(client, h, lab, "подтвердился", 20)
    await _login(client, "ls_d")
    p2 = await _close(client, h, lab, "не подтвердился", 80)
    personal, shared, (c1, c2) = await _read(h, p1, p2)
    assert c1 > 0 and c2 < 0                       # контроль: оба вклада реально записаны
    assert shared == pytest.approx(c1 + c2)
    assert personal == pytest.approx(c1)           # личный сигнал владельца — только его собственный вклад


@pytest.mark.asyncio
async def test_prediction_without_lab_gives_no_lab_signal(client):
    await create_test_user("ls_e"); member = await create_test_user("ls_f")
    await _login(client, "ls_e")
    lab = await _lab(client, "ls-lab3"); await add_lab_member(lab, member.id, "member")
    h = await _lab_hyp(client, lab)
    await _login(client, "ls_f")
    p = await _close(client, h, None)              # участник, но прогноз не привязан к лаборатории
    personal, shared, (saved,) = await _read(h, p)
    assert saved == 0.0 and shared == 0.0 and personal == 0.0


@pytest.mark.asyncio
async def test_deleted_member_prediction_stays_in_lab_signal(client):
    """Закрытый с провалом прогноз нельзя «обнулить» удалением: track record не улучшить (как в калибровке)."""
    await create_test_user("ls_g"); member = await create_test_user("ls_h")
    await _login(client, "ls_g")
    lab = await _lab(client, "ls-lab4"); await add_lab_member(lab, member.id, "member")
    h = await _lab_hyp(client, lab)
    await _login(client, "ls_h")
    p = await _close(client, h, lab, "не подтвердился", 80)
    _, before, _ = await _read(h, p)
    assert before < 0                              # контроль: минус реально записан
    r = await client.delete(f"/api/v1/predictions/{p}")
    assert r.status_code == 204, r.text
    _, after, _ = await _read(h, p)
    assert after == pytest.approx(before)


@pytest.mark.asyncio
async def test_purged_member_prediction_stays_in_lab_signal(client):
    """Окончательное удаление тоже не стирает вклад: он уходит в «сухой остаток» вместе с прогнозом."""
    await create_test_user("ls_i"); member = await create_test_user("ls_j")
    await _login(client, "ls_i")
    lab = await _lab(client, "ls-lab5"); await add_lab_member(lab, member.id, "member")
    h = await _lab_hyp(client, lab)
    await _login(client, "ls_j")
    p = await _close(client, h, lab, "не подтвердился", 80)
    _, before, _ = await _read(h, p)
    assert before < 0                              # контроль: минус реально записан
    assert (await client.delete(f"/api/v1/predictions/{p}")).status_code == 204
    assert (await client.delete(f"/api/v1/prediction/{p}/permanent")).status_code == 204
    async with AsyncSessionLocal() as db:
        assert await db.get(Prediction, p) is None  # контроль: строка физически удалена
        after = await lab_signal(db, h)
    assert after == pytest.approx(before)


@pytest.mark.asyncio
async def test_lab_signal_is_zero_after_hypothesis_leaves_lab(client):
    """Гипотеза вынесена из лаборатории: чужие вклады участников в её сигнал больше не входят."""
    await create_test_user("ls_k"); member = await create_test_user("ls_l")
    await _login(client, "ls_k")
    lab = await _lab(client, "ls-lab6"); await add_lab_member(lab, member.id, "member")
    h = await _lab_hyp(client, lab)
    await _login(client, "ls_l")
    p = await _close(client, h, lab, "подтвердился", 20)
    _, before, _ = await _read(h, p)
    assert before > 0                              # контроль: вклад реально записан
    async with AsyncSessionLocal() as db:
        hyp = await db.get(Hypothesis, h)
        hyp.lab_id = None
        hyp.visibility = "private"
        await db.commit()
    async with AsyncSessionLocal() as db:
        assert await lab_signal(db, h) == 0.0
