"""Эффект связи на сигнал гипотезы: поле effect в /graph/related и /preview. Видит только владелец гипотезы."""
import pytest
from sqlalchemy import update

from tests.conftest import create_test_user
from app.db.session import AsyncSessionLocal
from app.models.entities import Hypothesis, Observation, Prediction
from app.services.hypothesis_evidence import observation_signal


async def _login(client, username, password="pass12345"):
    r = await client.post("/api/v1/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200


async def _hyp(client, visibility="private"):
    r = await client.post("/api/v1/hypotheses/", json={"name": "Г", "description": "d", "date_created": "2026-08-06",
                                                       "status": "идея", "visibility": visibility})
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


async def _obs(client, importance):
    r = await client.post("/api/v1/observations/", json={"title": "Т", "date": "2026-09-23", "author": "a", "text": "x",
                                                         "lab_id": None, "visibility": "private", "tags": []})
    assert r.status_code == 201, r.text
    oid = r.json()["id"]
    async with AsyncSessionLocal() as db:
        await db.execute(update(Observation).where(Observation.id == oid).values(importance=importance))
        await db.commit()
    return oid


async def _pred(client, hyp_id, visibility="private"):
    r = await client.post("/api/v1/predictions/", json={"title": "п", "text": "т", "date_created": "2026-08-06",
        "expected_check_date": "2026-12-06T00:00:00", "status": "не проверен", "visibility": visibility,
        "confidence": 20, "hypothesis_id": hyp_id})
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


async def _close(client, pid, status="подтвердился"):
    r = await client.put(f"/api/v1/predictions/{pid}/close", json={"status": status, "result_notes": "итог"})
    assert r.status_code == 200, r.text


async def _link(client, a_type, a_id, b_type, b_id, lt):
    r = await client.post(f"/api/v1/graph/links?from_type={a_type}&from_id={a_id}&to_type={b_type}&to_id={b_id}&link_type={lt}")
    assert r.status_code == 200, r.text


async def _related(client, t, i):
    r = await client.get(f"/api/v1/graph/related/{t}/{i}")
    assert r.status_code == 200, r.text
    return r.json()["related"]


@pytest.mark.asyncio
async def test_observation_effects_sum_to_observation_signal(client):
    await create_test_user("le_a"); await _login(client, "le_a")
    h = await _hyp(client)
    o1, o2, o3 = await _obs(client, 5), await _obs(client, 3), await _obs(client, 5)
    await _link(client, "observation", o1, "hypothesis", h, "подтверждает")
    await _link(client, "observation", o2, "hypothesis", h, "опровергает")
    await _link(client, "observation", o3, "hypothesis", h, "связано")
    items = {i["id"]: i for i in (await _related(client, "hypothesis", h))["observation"]}
    assert items[o1]["effect"]["kind"] == "counted" and items[o1]["effect"]["value"] == pytest.approx(0.3)
    assert items[o2]["effect"]["kind"] == "counted" and items[o2]["effect"]["value"] == pytest.approx(-0.18)
    assert items[o3]["effect"] == {"kind": "not_counted", "value": None}      # нейтральная связь в сигнал не идёт
    async with AsyncSessionLocal() as db:
        hyp = await db.get(Hypothesis, h)
        real = await observation_signal(db, hyp.user_id, h)
    counted = sum(i["effect"]["value"] for i in items.values() if i["effect"]["kind"] == "counted")
    assert counted == pytest.approx(real)
    # то же с другой стороны: из наблюдения видна гипотеза и её эффект
    back = (await _related(client, "observation", o1))["hypothesis"]
    assert back[0]["effect"]["value"] == pytest.approx(0.3)


@pytest.mark.asyncio
async def test_prediction_effect_pending_counted_and_unknown(client):
    await create_test_user("le_b"); await _login(client, "le_b")
    h = await _hyp(client)
    p_open, p_closed, p_old = await _pred(client, h), await _pred(client, h), await _pred(client, h)
    await _close(client, p_closed); await _close(client, p_old)
    async with AsyncSessionLocal() as db:
        saved = (await db.get(Prediction, p_closed)).signal_contribution
        await db.execute(update(Prediction).where(Prediction.id == p_old).values(signal_contribution=None))
        await db.commit()
    assert saved is not None and saved > 0
    items = {i["id"]: i for i in (await _related(client, "hypothesis", h))["prediction"]}
    assert items[p_open]["effect"] == {"kind": "pending", "value": 0.0}
    assert items[p_closed]["effect"] == {"kind": "counted", "value": pytest.approx(saved)}
    assert items[p_old]["effect"] == {"kind": "unknown", "value": None}       # закрыт до колонки: размер не сохранён


@pytest.mark.asyncio
async def test_effect_hidden_from_non_owner_but_link_still_visible(client):
    await create_test_user("le_c"); await create_test_user("le_d")
    await _login(client, "le_c")
    h = await _hyp(client, "public")
    p = await _pred(client, h, "public"); await _close(client, p)
    mine = {i["id"]: i for i in (await _related(client, "hypothesis", h))["prediction"]}
    assert mine[p]["effect"]["kind"] == "counted"
    await _login(client, "le_d")
    theirs = {i["id"]: i for i in (await _related(client, "hypothesis", h))["prediction"]}
    assert p in theirs                                   # связь видна (иначе проверка ниже была бы пустой)
    assert theirs[p]["effect"] is None


@pytest.mark.asyncio
async def test_preview_of_prediction_carries_effect_for_owner_only(client):
    await create_test_user("le_e"); await create_test_user("le_f")
    await _login(client, "le_e")
    h = await _hyp(client, "public")
    p = await _pred(client, h, "public")
    r = await client.get(f"/api/v1/prediction/{p}/preview")
    assert r.status_code == 200, r.text
    assert r.json()["effect"] == {"kind": "pending", "value": 0.0}
    await _close(client, p)
    saved = (await client.get(f"/api/v1/prediction/{p}/preview")).json()["effect"]
    assert saved["kind"] == "counted" and saved["value"] != 0
    await _login(client, "le_f")
    r = await client.get(f"/api/v1/prediction/{p}/preview")
    assert r.status_code == 200 and r.json()["effect"] is None


@pytest.mark.asyncio
async def test_preview_of_observation_lists_effect_per_own_hypothesis(client):
    await create_test_user("le_g"); await create_test_user("le_h")
    await _login(client, "le_g")
    h1, h2 = await _hyp(client), await _hyp(client)
    o = await _obs(client, 5)
    await _link(client, "observation", o, "hypothesis", h1, "подтверждает")
    await _link(client, "observation", o, "hypothesis", h2, "связано")
    r = await client.get(f"/api/v1/observation/{o}/preview")
    assert r.status_code == 200, r.text
    by = {e["hypothesis_id"]: e for e in r.json()["effects"]}
    assert set(by) == {h1, h2}
    assert by[h1]["effect"]["kind"] == "counted" and by[h1]["effect"]["value"] == pytest.approx(0.3)
    assert by[h2]["effect"]["kind"] == "not_counted"
    assert r.json()["effect"] is None
    # чужой зритель публичного наблюдения: видит только эффект на СВОЮ гипотезу, чужих (h1, h2) нет
    async with AsyncSessionLocal() as db:
        await db.execute(update(Observation).where(Observation.id == o).values(visibility="public"))
        await db.commit()
    await _login(client, "le_h")
    r = await client.get(f"/api/v1/observation/{o}/preview")
    assert r.status_code == 200 and r.json()["effects"] == []   # контроль: запись видна, но эффектов нет
    hh = await _hyp(client)
    await _link(client, "observation", o, "hypothesis", hh, "опровергает")
    ef = (await client.get(f"/api/v1/observation/{o}/preview")).json()["effects"]
    assert [e["hypothesis_id"] for e in ef] == [hh]
    assert ef[0]["effect"]["value"] == pytest.approx(-0.3)
