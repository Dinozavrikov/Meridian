"""Матрица «запись открыта лаборатории через связь» (целевое поведение).
Запись N открыта участнику лаборатории L, только если: N связана (Link) с записью R, лежащей в L (visibility != private);
связь создал ВЛАДЕЛЕЦ N; владелец N сам состоит в L; ни N, ни R не в корзине; ровно один шаг (R не «открытая через связь»).
Связи вставляются прямо в БД: тест проверяет правило чтения, а не будущий запрос согласия на создании."""
from datetime import datetime, timezone

import pytest
from sqlalchemy import delete, update

from app.db.session import AsyncSessionLocal
from app.models.entities import Link, Observation
from tests.conftest import add_lab_member, create_test_user
from tests.share_helpers import add_share


async def _login(client, username, password="pass12345"):
    r = await client.post("/api/v1/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200, r.text


async def _mk_lab(client, name):
    r = await client.post("/api/v1/labs", json={"name": name, "is_public": False, "open_join": False,
                                                "goal_type": "task", "new_goal_title": "g"})
    assert r.status_code == 200, r.text
    return r.json()["id"]


async def _mk_obs(client, title, lab=None, vis="private"):
    r = await client.post("/api/v1/observations/", json={"title": title, "date": "2026-09-23", "author": "a", "text": "x",
                                                         "lab_id": lab, "visibility": vis, "tags": []})
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def _link(by_user_id, n, r):
    async with AsyncSessionLocal() as db:
        db.add(Link(user_id=by_user_id, from_type="observation", from_id=n, to_type="observation", to_id=r, link_type="связано"))
        await db.commit()
    await add_share("observation", n, "observation", r, by_user_id)


async def _view(client, username, oid):
    await _login(client, username)
    listed = {o["id"] for o in (await client.get("/api/v1/observations/")).json()}
    direct = (await client.get(f"/api/v1/observations/{oid}")).status_code
    preview = (await client.get(f"/api/v1/observation/{oid}/preview")).status_code
    return {"listed": oid in listed, "direct": direct, "preview": preview}


async def _world(client):
    """a — автор и владелец лаборатории; b, c — участники; s — посторонний. R лабораторная, N приватная, обе у a."""
    a = await create_test_user("ov_a"); b = await create_test_user("ov_b")
    c = await create_test_user("ov_c"); await create_test_user("ov_s")
    await _login(client, "ov_a")
    lab = await _mk_lab(client, "ov-lab")
    await add_lab_member(lab, b.id); await add_lab_member(lab, c.id)
    r = await _mk_obs(client, "R", lab, "lab")
    n = await _mk_obs(client, "N")
    return a, b, c, lab, r, n


def _closed(v):
    return not v["listed"] and v["direct"] != 200 and v["preview"] != 200


@pytest.mark.asyncio
async def test_member_sees_private_record_linked_by_its_owner(client):
    a, b, c, lab, r, n = await _world(client)
    await _link(a.id, n, r)
    v = await _view(client, "ov_b", n)
    assert v["listed"], v
    assert v["direct"] == 200, v
    assert v["preview"] == 200, v
    rel = await client.get(f"/api/v1/graph/related/observation/{r}")
    assert n in [i["id"] for i in rel.json()["related"].get("observation", [])]


@pytest.mark.asyncio
async def test_stranger_never_sees_it(client):
    """ОХРАННЫЙ (зелёный и до патча)."""
    a, b, c, lab, r, n = await _world(client)
    await _link(a.id, n, r)
    assert _closed(await _view(client, "ov_s", n))


@pytest.mark.asyncio
async def test_owner_keeps_access(client):
    """ОХРАННЫЙ (зелёный и до патча)."""
    a, b, c, lab, r, n = await _world(client)
    await _link(a.id, n, r)
    assert (await _view(client, "ov_a", n))["direct"] == 200


@pytest.mark.asyncio
async def test_deleting_the_link_revokes_access(client):
    a, b, c, lab, r, n = await _world(client)
    await _link(a.id, n, r)
    assert (await _view(client, "ov_b", n))["direct"] == 200      # открыто
    async with AsyncSessionLocal() as db:
        await db.execute(delete(Link)); await db.commit()
    assert _closed(await _view(client, "ov_b", n))                # закрыто сразу, без пересчёта


@pytest.mark.asyncio
async def test_second_hop_stays_closed(client):
    """ОХРАННЫЙ (зелёный и до патча): N2 связана только с N, а N открыта сама через связь."""
    a, b, c, lab, r, n = await _world(client)
    n2 = await _mk_obs(client, "N2")
    await _link(a.id, n, r)
    await _link(a.id, n2, n)
    assert _closed(await _view(client, "ov_b", n2))


@pytest.mark.asyncio
async def test_link_made_by_non_owner_does_not_open(client):
    """Связь N-R создал участник b, а N принадлежит a: согласия владельца N нет."""
    a, b, c, lab, r, n = await _world(client)
    await _link(b.id, n, r)
    assert _closed(await _view(client, "ov_c", n))
    assert _closed(await _view(client, "ov_b", n))


@pytest.mark.asyncio
async def test_owner_outside_the_lab_does_not_publish_into_it(client):
    """Автор N не состоит в лаборатории R: подбросить свою запись в чужую лабораторию нельзя."""
    m = await create_test_user("ov_m"); b = await create_test_user("ov_b")
    a = await create_test_user("ov_a")
    await _login(client, "ov_m")
    lab = await _mk_lab(client, "ov-lab-2")
    await add_lab_member(lab, b.id)
    r = await _mk_obs(client, "R", lab, "lab")
    await _login(client, "ov_a")
    n = await _mk_obs(client, "N")
    await _link(a.id, n, r)
    assert _closed(await _view(client, "ov_b", n))


@pytest.mark.asyncio
async def test_trashed_records_open_nothing(client):
    """ОХРАННЫЙ (зелёный и до патча): после правила должны остаться закрытыми."""
    a, b, c, lab, r, n = await _world(client)
    await _link(a.id, n, r)
    now = datetime.now(timezone.utc)
    async with AsyncSessionLocal() as db:
        await db.execute(update(Observation).where(Observation.id == n).values(deleted_at=now)); await db.commit()
    assert _closed(await _view(client, "ov_b", n))
    async with AsyncSessionLocal() as db:
        await db.execute(update(Observation).where(Observation.id == n).values(deleted_at=None))
        await db.execute(update(Observation).where(Observation.id == r).values(deleted_at=now)); await db.commit()
    assert _closed(await _view(client, "ov_b", n))


@pytest.mark.asyncio
async def test_private_neighbour_without_lab_publishes_nothing(client):
    """ОХРАННЫЙ (зелёный и до патча): R приватная и без лаборатории, связь с ней ничего не открывает."""
    a, b, c, lab, r, n = await _world(client)
    plain = await _mk_obs(client, "Plain")
    await _link(a.id, n, plain)
    assert _closed(await _view(client, "ov_b", n))
