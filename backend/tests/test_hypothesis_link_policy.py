"""
Тесты на единую политику LINK (can_link, см. lab_access.py, документ п.9/п.10):
нельзя привязать к своей сущности чужую непубличную гипотезу вслепую по id —
ни через task (уже было исправлено), ни через question, ни через prediction.
Плюс: hyp_name не должен течь через prediction, если сама гипотеза не видна.
"""
import pytest
from tests.conftest import create_test_user


async def _login(client, username, password="pass12345"):
    r = await client.post("/api/v1/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_add_question_hyp_rejects_foreign_private_hypothesis(client):
    await create_test_user("qh_owner")
    await create_test_user("qh_attacker")

    await _login(client, "qh_owner")
    hyp = (await client.post("/api/v1/hypotheses/", json={
        "name": "Owner's private hyp", "description": "secret",
        "date_created": "2026-08-06", "status": "идея",
        "visibility": "private",
    })).json()

    await _login(client, "qh_attacker")
    q = (await client.post("/api/v1/questions/", json={
        "title": "Attacker's question", "date_created": "2026-08-06",
        "status": "открыт", "visibility": "private",
    })).json()
    assert "id" in q, f"question creation failed: {q}"

    r = await client.post(f"/api/v1/questions/{q['id']}/hypotheses/{hyp['id']}")
    assert r.status_code == 403, "нельзя привязать чужую приватную гипотезу к своему вопросу вслепую по id"


@pytest.mark.asyncio
async def test_create_pred_rejects_foreign_private_hypothesis(client):
    await create_test_user("ph_owner")
    await create_test_user("ph_attacker")

    await _login(client, "ph_owner")
    hyp = (await client.post("/api/v1/hypotheses/", json={
        "name": "Owner's private hyp 2", "description": "secret 2",
        "date_created": "2026-08-06", "status": "идея",
        "visibility": "private",
    })).json()

    await _login(client, "ph_attacker")
    r = await client.post("/api/v1/predictions/", json={
        "title": "Attacker's prediction", "text": "will happen",
        "date_created": "2026-08-06", "expected_check_date": "2026-09-06T00:00:00",
        "hypothesis_id": hyp["id"], "status": "не проверен", "visibility": "public",
    })
    assert r.status_code == 403, "нельзя создать prediction с чужой приватной hypothesis_id"


@pytest.mark.asyncio
async def test_update_pred_rejects_foreign_private_hypothesis(client):
    await create_test_user("up_owner")
    await create_test_user("up_attacker")

    await _login(client, "up_owner")
    hyp = (await client.post("/api/v1/hypotheses/", json={
        "name": "Owner's private hyp 3", "description": "secret 3",
        "date_created": "2026-08-06", "status": "идея",
        "visibility": "private",
    })).json()

    await _login(client, "up_attacker")
    pred = (await client.post("/api/v1/predictions/", json={
        "title": "Attacker's own prediction", "text": "will happen",
        "date_created": "2026-08-06", "expected_check_date": "2026-09-06T00:00:00",
        "status": "не проверен", "visibility": "public",
    })).json()

    r = await client.put(f"/api/v1/predictions/{pred['id']}", json={
        "title": "Attacker's own prediction", "text": "will happen",
        "date_created": "2026-08-06", "expected_check_date": "2026-09-06T00:00:00",
        "hypothesis_id": hyp["id"], "status": "не проверен", "confidence": None,
        "result_notes": "", "visibility": "public", "confirms_hypothesis_if_true": True,
    })
    assert r.status_code == 403, "нельзя задним числом привязать к своему prediction чужую приватную гипотезу"


@pytest.mark.asyncio
async def test_hyp_name_hidden_when_hypothesis_not_visible(client):
    """Публичный prediction с приватной гипотезой владельца — сторонний
    пользователь видит prediction (он публичный), но не должен видеть
    hyp_name, потому что саму гипотезу ему видеть нельзя."""
    await create_test_user("hn_owner")
    await create_test_user("hn_viewer")

    await _login(client, "hn_owner")
    hyp = (await client.post("/api/v1/hypotheses/", json={
        "name": "Owner's own private hyp name", "description": "secret 4",
        "date_created": "2026-08-06", "status": "идея",
        "visibility": "private",
    })).json()
    pred = (await client.post("/api/v1/predictions/", json={
        "title": "Owner's public prediction", "text": "will happen",
        "date_created": "2026-08-06", "expected_check_date": "2026-09-06T00:00:00",
        "hypothesis_id": hyp["id"], "status": "не проверен", "visibility": "public",
    })).json()
    assert pred["hyp_name"] == "Owner's own private hyp name", "владелец сам видит имя своей гипотезы"

    await _login(client, "hn_viewer")
    r = await client.get(f"/api/v1/predictions/{pred['id']}")
    assert r.status_code == 200
    body = r.json()
    assert body["hyp_name"] is None, "сторонний пользователь не должен видеть имя чужой приватной гипотезы через публичный prediction"

    r_list = await client.get("/api/v1/predictions/")
    listed = next(p for p in r_list.json() if p["id"] == pred["id"])
    assert listed["hyp_name"] is None, "то же самое в списке предсказаний"
