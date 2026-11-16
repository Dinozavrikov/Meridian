"""API стадий (EntityStage) — опциональная привязка к одной из 8
фиксированных платформенных стадий. См. api/v1/entity_stage.py и
docs/EVENT_LOG_AND_CLEANUP.md (реестр POLYMORPHIC_CHILD_MODELS,
куда EntityStage тоже входит — orphan-cleanup для неё уже покрыт
test_polymorphic_cleanup.py на уровне SQL, здесь тестируется сам API)."""
import pytest
from sqlalchemy import select

from app.db.session import AsyncSessionLocal
from app.models.entities import Event, EntityStage
from tests.conftest import create_test_user, add_lab_member


async def _login(client, username, password="pass12345"):
    r = await client.post("/api/v1/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200


async def _create_lab(client, name, is_public=False):
    r = await client.post("/api/v1/labs", json={
        "name": name, "is_public": is_public, "open_join": False,
        "goal_type": "task", "new_goal_title": f"Goal for {name}",
    })
    assert r.status_code == 200, r.text
    return r.json()


async def _create_obs(client, title="Stage test obs"):
    r = await client.post("/api/v1/observations/", json={
        "title": title, "date": "2026-09-23", "author": "tester", "text": "obs body",
        "lab_id": None, "visibility": "private",
    })
    assert r.status_code == 201, r.text
    return r.json()


@pytest.mark.asyncio
async def test_untracked_entity_returns_null_not_404(client):
    """Отсутствие записи = "стадия не отслеживается" — нормальное
    состояние, не ошибка."""
    await create_test_user("stg_owner1")
    await _login(client, "stg_owner1")
    obs = await _create_obs(client)

    r = await client.get(f"/api/v1/observation/{obs['id']}/stage")
    assert r.status_code == 200
    assert r.json() is None


@pytest.mark.asyncio
async def test_owner_can_set_and_change_stage(client):
    await create_test_user("stg_owner2")
    await _login(client, "stg_owner2")
    obs = await _create_obs(client)
    url = f"/api/v1/observation/{obs['id']}/stage"

    r = await client.put(url, json={"stage": "question"})
    assert r.status_code == 200, r.text
    assert r.json()["current_stage"] == "question"

    r = await client.get(url)
    assert r.status_code == 200 and r.json()["current_stage"] == "question"

    r = await client.put(url, json={"stage": "prototype"})
    assert r.status_code == 200 and r.json()["current_stage"] == "prototype"

    r = await client.get(url)
    assert r.json()["current_stage"] == "prototype"


@pytest.mark.asyncio
async def test_upsert_does_not_create_duplicate_rows(client):
    """PUT дважды на одну сущность — одна строка в БД (проверка самого
    ON CONFLICT DO UPDATE, не только внешнего поведения API). Своя короткая
    AsyncSessionLocal ПОСЛЕ всех client-запросов — не расшаренная db_session
    вперемешку с client (см. conftest.py::create_test_user про
    "attached to a different loop")."""
    await create_test_user("stg_owner3")
    await _login(client, "stg_owner3")
    obs = await _create_obs(client)
    url = f"/api/v1/observation/{obs['id']}/stage"

    await client.put(url, json={"stage": "question"})
    await client.put(url, json={"stage": "research"})
    await client.put(url, json={"stage": "experiments"})

    async with AsyncSessionLocal() as db:
        rows = (await db.execute(
            select(EntityStage).where(EntityStage.entity_type == "observation", EntityStage.entity_id == obs["id"])
        )).scalars().all()
    assert len(rows) == 1
    assert rows[0].current_stage == "experiments"


@pytest.mark.asyncio
async def test_backward_transition_is_allowed_without_validation(client):
    """Переходы свободны в обе стороны — никакой валидации "логичности"
    порядка (см. STAGE_VALUES в models/entities.py)."""
    await create_test_user("stg_owner4")
    await _login(client, "stg_owner4")
    obs = await _create_obs(client)
    url = f"/api/v1/observation/{obs['id']}/stage"

    await client.put(url, json={"stage": "proven_product"})
    r = await client.put(url, json={"stage": "question"})
    assert r.status_code == 200 and r.json()["current_stage"] == "question"


@pytest.mark.asyncio
async def test_invalid_stage_value_rejected(client):
    await create_test_user("stg_owner5")
    await _login(client, "stg_owner5")
    obs = await _create_obs(client)

    r = await client.put(f"/api/v1/observation/{obs['id']}/stage", json={"stage": "not_a_real_stage"})
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_outsider_cannot_set_or_read_stage(client):
    await create_test_user("stg_owner6")
    await create_test_user("stg_outsider6")
    await _login(client, "stg_owner6")
    obs = await _create_obs(client)
    url = f"/api/v1/observation/{obs['id']}/stage"
    await client.put(url, json={"stage": "question"})

    await _login(client, "stg_outsider6")
    r = await client.put(url, json={"stage": "prototype"})
    assert r.status_code == 403
    r = await client.get(url)
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_stage_changed_event_emitted_with_old_and_new(client):
    await create_test_user("stg_owner7")
    await _login(client, "stg_owner7")
    obs = await _create_obs(client)
    url = f"/api/v1/observation/{obs['id']}/stage"

    await client.put(url, json={"stage": "question"})
    await client.put(url, json={"stage": "research"})

    async with AsyncSessionLocal() as db:
        events = (await db.execute(
            select(Event).where(Event.type == "stage_changed", Event.entity_type == "observation", Event.entity_id == obs["id"])
            .order_by(Event.id)
        )).scalars().all()
    assert len(events) == 2
    assert events[0].meta == {"old_stage": None, "new_stage": "question"}
    assert events[1].meta == {"old_stage": "question", "new_stage": "research"}


@pytest.mark.asyncio
async def test_lab_owner_can_set_stage_on_the_lab_itself(client):
    await create_test_user("stg_labowner1")
    await _login(client, "stg_labowner1")
    lab = await _create_lab(client, "Stage Lab 1")

    url = f"/api/v1/lab/{lab['id']}/stage"
    r = await client.put(url, json={"stage": "research"})
    assert r.status_code == 200, r.text
    assert r.json()["current_stage"] == "research"


@pytest.mark.asyncio
async def test_lab_plain_member_cannot_set_stage_only_admin_owner_can(client):
    await create_test_user("stg_labowner2")
    await _login(client, "stg_labowner2")
    lab = await _create_lab(client, "Stage Lab 2")

    member = await create_test_user("stg_labmember2")
    await add_lab_member(lab["id"], member.id, role="member")
    admin = await create_test_user("stg_labadmin2")
    await add_lab_member(lab["id"], admin.id, role="admin")

    url = f"/api/v1/lab/{lab['id']}/stage"

    await _login(client, "stg_labmember2")
    r = await client.put(url, json={"stage": "research"})
    assert r.status_code == 403

    await _login(client, "stg_labadmin2")
    r = await client.put(url, json={"stage": "research"})
    assert r.status_code == 200, r.text


# --- GET /stages/{stage} ---

@pytest.mark.asyncio
async def test_list_by_stage_route_is_not_shadowed_by_param_route(client):
    """Регресс на порядок регистрации роутов: GET /stages/{stage} должен
    матчиться раньше GET /{entity_type}/{entity_id}/stage, иначе "stages"
    попал бы в entity_type, а сам stage-параметр — в entity_id (упало бы
    на int-парсинге пути)."""
    await create_test_user("stg_route1")
    await _login(client, "stg_route1")

    r = await client.get("/api/v1/stages/question")
    assert r.status_code == 200
    assert r.json() == []


@pytest.mark.asyncio
async def test_list_by_stage_enriches_with_correct_title_per_type(client):
    """Проверка per-type _TITLE_ATTR — особенно worldview.belief, которая
    не называется title/name как остальные."""
    await create_test_user("stg_list1")
    await _login(client, "stg_list1")

    obs = await _create_obs(client, title="Наблюдение про X")
    r = await client.put(f"/api/v1/observation/{obs['id']}/stage", json={"stage": "research"})
    assert r.status_code == 200, r.text

    r = await client.post("/api/v1/worldview/", json={
        "belief": "Убеждение про Y", "date": "2026-09-23", "visibility": "private", "lab_id": None,
    })
    assert r.status_code == 201, r.text
    wv = r.json()
    r = await client.put(f"/api/v1/worldview/{wv['id']}/stage", json={"stage": "research"})
    assert r.status_code == 200, r.text

    r = await client.get("/api/v1/stages/research")
    assert r.status_code == 200
    items = {(it["entity_type"], it["entity_id"]): it["title"] for it in r.json()}
    assert items[("observation", obs["id"])] == "Наблюдение про X"
    assert items[("worldview", wv["id"])] == "Убеждение про Y"


@pytest.mark.asyncio
async def test_list_by_stage_respects_visibility_own_public_lab_hidden_private(client):
    await create_test_user("stg_list2_owner")
    await create_test_user("stg_list2_outsider")

    await _login(client, "stg_list2_owner")
    private_obs = await _create_obs(client, title="Приватное")
    await client.put(f"/api/v1/observation/{private_obs['id']}/stage", json={"stage": "evidence"})

    r = await client.post("/api/v1/observations/", json={
        "title": "Публичное", "date": "2026-09-23", "author": "tester", "text": "x",
        "lab_id": None, "visibility": "public",
    })
    assert r.status_code == 201, r.text
    public_obs = r.json()
    await client.put(f"/api/v1/observation/{public_obs['id']}/stage", json={"stage": "evidence"})

    await _login(client, "stg_list2_outsider")
    r = await client.get("/api/v1/stages/evidence")
    ids = {it["entity_id"] for it in r.json()}
    assert public_obs["id"] in ids
    assert private_obs["id"] not in ids


@pytest.mark.asyncio
async def test_list_by_stage_includes_lab_stage_for_public_lab(client):
    await create_test_user("stg_list3_owner")
    await create_test_user("stg_list3_outsider")

    await _login(client, "stg_list3_owner")
    lab = await _create_lab(client, "Public Stage Lab", is_public=True)
    await client.put(f"/api/v1/lab/{lab['id']}/stage", json={"stage": "prototype"})

    await _login(client, "stg_list3_outsider")
    r = await client.get("/api/v1/stages/prototype")
    labs_in_result = [it for it in r.json() if it["entity_type"] == "lab"]
    assert any(it["entity_id"] == lab["id"] and it["title"] == "Public Stage Lab" for it in labs_in_result)


@pytest.mark.asyncio
async def test_list_by_stage_hides_private_lab_from_non_member(client):
    await create_test_user("stg_list4_owner")
    await create_test_user("stg_list4_outsider")

    await _login(client, "stg_list4_owner")
    lab = await _create_lab(client, "Private Stage Lab", is_public=False)
    await client.put(f"/api/v1/lab/{lab['id']}/stage", json={"stage": "prototype"})

    await _login(client, "stg_list4_outsider")
    r = await client.get("/api/v1/stages/prototype")
    lab_ids = {it["entity_id"] for it in r.json() if it["entity_type"] == "lab"}
    assert lab["id"] not in lab_ids


@pytest.mark.asyncio
async def test_list_by_stage_invalid_stage_rejected(client):
    await create_test_user("stg_list5")
    await _login(client, "stg_list5")
    r = await client.get("/api/v1/stages/not_a_real_stage")
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_list_by_stage_guest_sees_only_public(client):
    await create_test_user("stg_list6_owner")
    await _login(client, "stg_list6_owner")
    r = await client.post("/api/v1/observations/", json={
        "title": "Гостю видно", "date": "2026-09-23", "author": "tester", "text": "x",
        "lab_id": None, "visibility": "public",
    })
    assert r.status_code == 201, r.text
    public_obs = r.json()
    await client.put(f"/api/v1/observation/{public_obs['id']}/stage", json={"stage": "market_handoff"})

    private_obs = await _create_obs(client, title="Гостю не видно")
    await client.put(f"/api/v1/observation/{private_obs['id']}/stage", json={"stage": "market_handoff"})

    # Гость — новый client без логина (тот же httpx.AsyncClient без cookies,
    # эмулируем через logout, если он есть, иначе новый client-инстанс).
    r = await client.post("/api/v1/auth/logout")
    r = await client.get("/api/v1/stages/market_handoff")
    ids = {it["entity_id"] for it in r.json()}
    assert public_obs["id"] in ids
    assert private_obs["id"] not in ids
