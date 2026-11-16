"""
IDOR/access-тесты для фичи Result (Этап 6, публикация результатов).
Покрывает баг, найденный и исправленный в этой сессии: ветка "участник лабы"
в get_entity_for_view раньше давала доступ по одному lab_id, без проверки
visibility — для Result (в отличие от всех остальных сущностей) lab_id всегда
заполнен независимо от visibility, поэтому приватный черновик был доступен
любому участнику лабы через create_suggestion/accept_suggestion.
Исправлено в lab_access.py + results.py (оба маршрута теперь идут через
get_entity_for_view).
"""
import pytest
from tests.conftest import create_test_user, add_lab_member
from app.db.session import AsyncSessionLocal


async def _login(client, username, password="pass12345"):
    r = await client.post("/api/v1/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200


async def _create_lab(client, name, is_public=False):
    r = await client.post("/api/v1/labs", json={
        "name": name, "is_public": is_public,
        "goal_type": "task", "new_goal_title": f"Goal for {name}",
    })
    assert r.status_code == 200, r.text
    return r.json()


async def _create_result(client, lab_id, title="Draft result", visibility="private", body="secret body"):
    r = await client.post("/api/v1/results/", json={
        "title": title, "body": body, "lab_id": lab_id, "visibility": visibility,
    })
    assert r.status_code == 201, r.text
    return r.json()


@pytest.mark.asyncio
async def test_create_result_without_membership_forbidden(client):
    await create_test_user("res_owner1")
    await create_test_user("res_attacker1")
    await _login(client, "res_owner1")
    lab = await _create_lab(client, "Private Lab Res1", is_public=False)
    await _login(client, "res_attacker1")
    r = await client.post("/api/v1/results/", json={
        "title": "Injected", "body": "x", "lab_id": lab["id"], "visibility": "lab",
    })
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_outsider_cannot_view_private_result(client):
    await create_test_user("res_owner2")
    await create_test_user("res_outsider2")
    await _login(client, "res_owner2")
    lab = await _create_lab(client, "Private Lab Res2", is_public=False)
    res = await _create_result(client, lab["id"], visibility="private")
    await _login(client, "res_outsider2")
    r = await client.get(f"/api/v1/results/{res['id']}")
    assert r.status_code in (403, 404)


@pytest.mark.asyncio
async def test_member_cannot_suggest_edit_to_private_result(client):
    owner = await create_test_user("res_owner3")
    member = await create_test_user("res_member3")
    await _login(client, "res_owner3")
    lab = await _create_lab(client, "Private Lab Res3", is_public=False)
    await add_lab_member(lab["id"], member.id, role="member")
    res = await _create_result(client, lab["id"], visibility="private")
    await _login(client, "res_member3")
    r = await client.post(f"/api/v1/results/{res['id']}/suggestions", json={
        "proposed_body": "hijacked body",
    })
    assert r.status_code in (403, 404)


@pytest.mark.asyncio
async def test_admin_cannot_accept_suggestion_on_private_result(client):
    owner = await create_test_user("res_owner4")
    author = await create_test_user("res_author4")
    await _login(client, "res_owner4")
    lab = await _create_lab(client, "Private Lab Res4", is_public=False)
    await add_lab_member(lab["id"], author.id, role="member")
    await _login(client, "res_author4")
    res = await _create_result(client, lab["id"], visibility="lab")
    from app.models.entities import Result, ResultEditSuggestion
    async with AsyncSessionLocal() as db:
        db_res = await db.get(Result, res["id"])
        db_res.visibility = "private"
        sug = ResultEditSuggestion(result_id=res["id"], author_id=owner.id,
                                    proposed_body="owner edit", status="pending")
        db.add(sug)
        await db.commit()
        await db.refresh(sug)
    await _login(client, "res_owner4")
    r = await client.post(f"/api/v1/results/{res['id']}/suggestions/{sug.id}/accept")
    assert r.status_code in (403, 404)


@pytest.mark.asyncio
async def test_member_cannot_publish_result(client):
    owner = await create_test_user("res_owner5")
    member = await create_test_user("res_member5")
    await _login(client, "res_owner5")
    lab = await _create_lab(client, "Private Lab Res5", is_public=False)
    await add_lab_member(lab["id"], member.id, role="member")
    res = await _create_result(client, lab["id"], visibility="lab")
    await _login(client, "res_member5")
    r = await client.post(f"/api/v1/results/{res['id']}/publish")
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_owner_cannot_publish_private_result(client):
    await create_test_user("res_owner6")
    await _login(client, "res_owner6")
    lab = await _create_lab(client, "Private Lab Res6", is_public=False)
    res = await _create_result(client, lab["id"], visibility="private")
    r = await client.post(f"/api/v1/results/{res['id']}/publish")
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_non_member_cannot_suggest_edit(client):
    await create_test_user("res_owner7")
    await create_test_user("res_outsider7")
    await _login(client, "res_owner7")
    lab = await _create_lab(client, "Private Lab Res7", is_public=False)
    res = await _create_result(client, lab["id"], visibility="lab")
    await _login(client, "res_outsider7")
    r = await client.post(f"/api/v1/results/{res['id']}/suggestions", json={
        "proposed_body": "outsider edit",
    })
    assert r.status_code in (403, 404)


@pytest.mark.asyncio
async def test_member_cannot_self_accept_suggestion(client):
    owner = await create_test_user("res_owner8")
    member = await create_test_user("res_member8")
    await _login(client, "res_owner8")
    lab = await _create_lab(client, "Private Lab Res8", is_public=False)
    await add_lab_member(lab["id"], member.id, role="member")
    res = await _create_result(client, lab["id"], visibility="lab")
    await _login(client, "res_member8")
    r = await client.post(f"/api/v1/results/{res['id']}/suggestions", json={
        "proposed_body": "member edit",
    })
    assert r.status_code == 201, r.text
    sug_id = r.json()["id"]
    r2 = await client.post(f"/api/v1/results/{res['id']}/suggestions/{sug_id}/accept")
    assert r2.status_code == 403


@pytest.mark.asyncio
async def test_member_suggest_owner_accept_happy_path(client):
    await create_test_user("res_owner9")
    member = await create_test_user("res_member9")
    await _login(client, "res_owner9")
    lab = await _create_lab(client, "Private Lab Res9", is_public=False)
    await add_lab_member(lab["id"], member.id, role="member")
    res = await _create_result(client, lab["id"], visibility="lab", body="original")
    await _login(client, "res_member9")
    r = await client.post(f"/api/v1/results/{res['id']}/suggestions", json={
        "proposed_body": "improved body",
    })
    assert r.status_code == 201, r.text
    sug_id = r.json()["id"]
    await _login(client, "res_owner9")
    r2 = await client.post(f"/api/v1/results/{res['id']}/suggestions/{sug_id}/accept")
    assert r2.status_code == 200, r2.text
    assert r2.json()["body"] == "improved body"


@pytest.mark.asyncio
async def test_stale_publish_reverts_after_visibility_change(client):
    await create_test_user("res_owner10")
    await create_test_user("res_outsider10")
    await _login(client, "res_owner10")
    lab = await _create_lab(client, "Public Lab Res10", is_public=True)
    res = await _create_result(client, lab["id"], visibility="lab", body="will be revoked")
    r = await client.post(f"/api/v1/results/{res['id']}/publish")
    assert r.status_code == 200, r.text
    r2 = await client.put(f"/api/v1/results/{res['id']}", json={
        "title": res["title"], "body": res["body"], "visibility": "private",
    })
    assert r2.status_code == 200, r2.text
    assert r2.json()["is_published"] is False
    await _login(client, "res_outsider10")
    r3 = await client.get(f"/api/v1/results/{res['id']}")
    assert r3.status_code in (403, 404)


@pytest.mark.asyncio
async def test_published_result_in_private_lab_stays_hidden_externally(client):
    await create_test_user("res_owner11")
    await create_test_user("res_outsider11")
    await _login(client, "res_owner11")
    lab = await _create_lab(client, "Private Lab Res11", is_public=False)
    res = await _create_result(client, lab["id"], visibility="lab", body="lab body")
    r = await client.post(f"/api/v1/results/{res['id']}/publish")
    assert r.status_code == 200, r.text
    await _login(client, "res_outsider11")
    r2 = await client.get(f"/api/v1/results/{res['id']}")
    assert r2.status_code in (403, 404)


@pytest.mark.asyncio
async def test_published_result_in_public_lab_visible_to_outsider(client):
    await create_test_user("res_owner12")
    await create_test_user("res_outsider12")
    await _login(client, "res_owner12")
    lab = await _create_lab(client, "Public Lab Res12", is_public=True)
    res = await _create_result(client, lab["id"], visibility="lab", body="public body")
    r = await client.post(f"/api/v1/results/{res['id']}/publish")
    assert r.status_code == 200, r.text
    await _login(client, "res_outsider12")
    r2 = await client.get(f"/api/v1/results/{res['id']}")
    assert r2.status_code == 200, r2.text
    assert r2.json()["body"] == "public body"


@pytest.mark.asyncio
async def test_unpublished_lab_result_in_public_lab_hidden_from_outsider(client):
    await create_test_user("res_owner13")
    await create_test_user("res_outsider13")
    await _login(client, "res_owner13")
    lab = await _create_lab(client, "Public Lab Res13", is_public=True)
    res = await _create_result(client, lab["id"], visibility="lab", body="not yet published")
    await _login(client, "res_outsider13")
    r = await client.get(f"/api/v1/results/{res['id']}")
    assert r.status_code in (403, 404)


@pytest.mark.asyncio
async def test_list_results_shows_published_to_outsider_in_public_lab(client):
    await create_test_user("res_owner14")
    await create_test_user("res_outsider14")
    await _login(client, "res_owner14")
    lab = await _create_lab(client, "Public Lab Res14", is_public=True)
    res = await _create_result(client, lab["id"], visibility="lab", body="listed body")
    r = await client.post(f"/api/v1/results/{res['id']}/publish")
    assert r.status_code == 200, r.text
    await _login(client, "res_outsider14")
    r2 = await client.get("/api/v1/results/", params={"lab_id": lab["id"]})
    assert r2.status_code == 200, r2.text
    ids = [item["id"] for item in r2.json()]
    assert res["id"] in ids


@pytest.mark.asyncio
async def test_list_results_hides_unpublished_from_outsider_in_public_lab(client):
    await create_test_user("res_owner15")
    await create_test_user("res_outsider15")
    await _login(client, "res_owner15")
    lab = await _create_lab(client, "Public Lab Res15", is_public=True)
    res = await _create_result(client, lab["id"], visibility="lab", body="not listed")
    await _login(client, "res_outsider15")
    r = await client.get("/api/v1/results/", params={"lab_id": lab["id"]})
    assert r.status_code == 200, r.text
    ids = [item["id"] for item in r.json()]
    assert res["id"] not in ids
