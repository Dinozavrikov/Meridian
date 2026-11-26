"""Пара записей имеет одну связь автора, а знак сигнала не зависит от порядка строк на диске."""
from sqlalchemy import select, text

from app.db.session import AsyncSessionLocal
from app.models.entities import Hypothesis, Link
from app.services.hypothesis_evidence import _observation_evidence_query
from tests.conftest import create_test_user
from tests.test_graph_link_type import _login, _types


async def _records(client, username):
    await create_test_user(username)
    await _login(client, username)
    o = await client.post("/api/v1/observations/", json={
        "title": "t", "date": "2026-09-23", "author": "a", "text": "b", "importance": 5,
        "lab_id": None, "visibility": "private"})
    h = await client.post("/api/v1/hypotheses/", json={
        "name": "h", "description": "d", "date_created": "2026-08-06", "status": "идея", "visibility": "private"})
    assert o.status_code < 300 and h.status_code < 300, (o.text, h.text)
    return o.json()["id"], h.json()["id"]


async def _add(client, a, a_id, b, b_id, kind):
    r = await client.post("/api/v1/graph/links", params={
        "from_type": a, "from_id": a_id, "to_type": b, "to_id": b_id, "link_type": kind})
    assert r.status_code == 200, r.text


async def test_reverse_direction_does_not_create_second_link(client):
    oid, hid = await _records(client, "rev_pair")
    await _add(client, "observation", oid, "hypothesis", hid, "подтверждает")
    await _add(client, "hypothesis", hid, "observation", oid, "опровергает")
    assert await _types() == ["подтверждает"]


async def test_signal_takes_newest_link_regardless_of_row_order(client):
    oid, hid = await _records(client, "rev_order")
    async with AsyncSessionLocal() as db:
        uid = (await db.get(Hypothesis, hid)).user_id
        old = Link(user_id=uid, from_type="observation", from_id=oid,
                   to_type="hypothesis", to_id=hid, link_type="подтверждает")
        db.add(old)
        await db.commit()
        old_id = old.id
        db.add(Link(user_id=uid, from_type="hypothesis", from_id=hid,
                    to_type="observation", to_id=oid, link_type="опровергает"))
        await db.commit()
    async with AsyncSessionLocal() as db:
        # новая версия старой строки ложится после более новой: физический порядок расходится с порядком id
        await db.execute(text("UPDATE links SET link_type = link_type WHERE id = :i"), {"i": old_id})
        await db.commit()
    async with AsyncSessionLocal() as db:
        for knob in ("enable_indexscan", "enable_indexonlyscan", "enable_bitmapscan"):
            await db.execute(text(f"SET LOCAL {knob} = off"))
        physical = (await db.execute(select(Link.id))).scalars().all()
        assert physical[-1] == old_id, "предпосылка теста не выполнена"
        evidence = await _observation_evidence_query(db, uid, hid)
    assert evidence == [(oid, -1, 5)]
