"""Slug: глобальная уникальность + случайный суффикс (откат partial-схемы,
см. миграцию f4d8b6c2a913 и app/core/slug.py). Модель проще предыдущей:
slug выдаётся один раз и больше никогда не меняется — ни при смене лабы,
ни при restore, ни при удалении лабы, поэтому старые ссылки не могут
"протухнуть" в принципе, историю переименований вести не нужно."""
import pytest
from sqlalchemy import select

from app.core.slug import make_slug, unique_slug_for
from app.db.session import AsyncSessionLocal
from app.models.entities import Observation
from tests.conftest import create_test_user
from tests.test_soft_delete_api import _build, _delete_url, _login


async def _login_create_lab(client, username, name):
    await _login(client, username)
    r = await client.post("/api/v1/labs", json={
        "name": name, "is_public": False, "open_join": False,
        "goal_type": "task", "new_goal_title": f"Goal {name}",
    })
    assert r.status_code == 200, r.text
    return r.json()["id"]


async def _get_obs(eid):
    async with AsyncSessionLocal() as db:
        return await db.get(Observation, eid)


# ── п.6.1: два личных пользователя, одинаковое название -> разные, но валидные slug'и ──
@pytest.mark.asyncio
async def test_two_users_same_title_get_distinct_valid_slugs(client):
    a = await create_test_user("slug_a")
    b = await create_test_user("slug_b")
    payload = {"title": "Общее название", "date": "2026-09-25", "author": "t", "text": "x",
               "lab_id": None, "visibility": "private"}
    await _login(client, a.username)
    ra = await client.post("/api/v1/observations/", json=payload)
    assert ra.status_code == 201, ra.text
    await _login(client, b.username)
    rb = await client.post("/api/v1/observations/", json=payload)
    assert rb.status_code == 201, rb.text
    slug_a, slug_b = (await _get_obs(ra.json()["id"])).slug, (await _get_obs(rb.json()["id"])).slug
    base = make_slug("Общее название")
    assert slug_a != slug_b
    assert slug_a.startswith(base + "-") and slug_b.startswith(base + "-")


# ── п.6.2: два участника одной лабы, одинаковое название -> тоже разные slug'и ──
@pytest.mark.asyncio
async def test_two_lab_members_same_title_get_distinct_slugs(client):
    owner = await create_test_user("slug_lab_o")
    member = await create_test_user("slug_lab_m")
    lab_id = await _login_create_lab(client, owner.username, "Slug Lab")
    from tests.conftest import add_lab_member
    await add_lab_member(lab_id, member.id, role="member")
    payload = {"title": "Дубль в лабе", "date": "2026-09-25", "author": "t", "text": "x",
               "lab_id": lab_id, "visibility": "lab"}
    await _login(client, owner.username)
    r1 = await client.post("/api/v1/observations/", json=payload)
    assert r1.status_code == 201, r1.text
    await _login(client, member.username)
    r2 = await client.post("/api/v1/observations/", json=payload)
    assert r2.status_code == 201, r2.text
    assert (await _get_obs(r1.json()["id"])).slug != (await _get_obs(r2.json()["id"])).slug


# ── п.6.3: soft-delete не блокирует новый slug (уже неактуально как риск, но поведение не должно сломаться) ──
@pytest.mark.asyncio
async def test_trashed_record_does_not_affect_new_records(client):
    u = await create_test_user("slug_trash")
    payload = {"title": "Переиспользуемое", "date": "2026-09-25", "author": "t", "text": "x",
               "lab_id": None, "visibility": "private"}
    await _login(client, u.username)
    r1 = await client.post("/api/v1/observations/", json=payload)
    assert r1.status_code == 201
    assert (await client.delete(_delete_url("observation", r1.json()["id"]))).status_code == 204
    r2 = await client.post("/api/v1/observations/", json=payload)
    assert r2.status_code == 201


# ── unique_slug_for: юнит-уровень ──
@pytest.mark.asyncio
async def test_unique_slug_for_generates_distinct_suffixes(test_user):
    async with AsyncSessionLocal() as db:
        s1 = await unique_slug_for(db, Observation, "Тест слаг")
        s2 = await unique_slug_for(db, Observation, "Тест слаг")
        base = make_slug("Тест слаг")
        assert s1 != s2
        assert s1.startswith(base + "-") and s2.startswith(base + "-")
        assert len(s1) == len(base) + 7  # base + "-" + 6 случайных символов


# ── slug никогда не меняется: смена лабы, restore, удаление лабы ──
@pytest.mark.asyncio
async def test_slug_never_changes_on_lab_move(client):
    u = await create_test_user("slug_move")
    await _login(client, u.username)
    lab_id = await _login_create_lab(client, u.username, "Move Lab")
    r = await client.post("/api/v1/observations/", json={
        "title": "Мигрирующее", "date": "2026-09-25", "author": "t", "text": "x",
        "lab_id": lab_id, "visibility": "lab",
    })
    assert r.status_code == 201, r.text
    slug_before = (await _get_obs(r.json()["id"])).slug

    body = {"title": "Переименованное при переносе", "date": "2026-09-25", "author": "t", "text": "x", "lab_id": None, "visibility": "private"}
    r_update = await client.put(f"/api/v1/observations/{r.json()['id']}", json=body)
    assert r_update.status_code == 200, r_update.text
    assert r_update.json()["title"] == "Переименованное при переносе"  # заголовок реально сменился, а slug нет
    assert (await _get_obs(r.json()["id"])).slug == slug_before

    r_by_slug = await client.get(f"/api/v1/observations/{slug_before}")
    assert r_by_slug.status_code == 200 and r_by_slug.json()["id"] == r.json()["id"]


@pytest.mark.asyncio
async def test_slug_never_changes_on_restore(client):
    u = await create_test_user("slug_restore")
    payload = {"title": "Восстанавливаемое", "date": "2026-09-25", "author": "t", "text": "x",
               "lab_id": None, "visibility": "private"}
    await _login(client, u.username)
    r = await client.post("/api/v1/observations/", json=payload)
    slug_before = (await _get_obs(r.json()["id"])).slug
    assert (await client.delete(_delete_url("observation", r.json()["id"]))).status_code == 204
    assert (await client.post(f"/api/v1/observation/{r.json()['id']}/restore")).status_code == 204
    assert (await _get_obs(r.json()["id"])).slug == slug_before


@pytest.mark.asyncio
async def test_slug_never_changes_on_delete_lab(client):
    u = await create_test_user("slug_dellab")
    await _login(client, u.username)
    lab_id = await _login_create_lab(client, u.username, "Doomed Lab")
    r = await client.post("/api/v1/observations/", json={
        "title": "Останется без лабы", "date": "2026-09-25", "author": "t", "text": "x",
        "lab_id": lab_id, "visibility": "lab",
    })
    assert r.status_code == 201
    slug_before = (await _get_obs(r.json()["id"])).slug
    assert (await client.delete(f"/api/v1/labs/{lab_id}")).status_code == 200
    moved = await _get_obs(r.json()["id"])
    assert moved.lab_id is None and moved.slug == slug_before
