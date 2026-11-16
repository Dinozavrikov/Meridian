"""Лента-группы читает видимость и связи у самих записей, а не из копии в событии. Замена test_feed_stale_events.py
(тот проверял старую ленту из events): запись вышла из лаборатории, связь удалена, приватный сосед публичной записи."""
import json

import pytest

from tests.conftest import add_lab_member, create_test_user

GRAPH = "/api/v1/graph"


async def _login(client, username, password="pass12345"):
    r = await client.post("/api/v1/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200


async def _create_lab(client, name):
    r = await client.post("/api/v1/labs", json={
        "name": name, "is_public": False, "goal_type": "task", "new_goal_title": f"Goal for {name}",
    })
    assert r.status_code == 200, r.text
    return r.json()


def _hyp_body(name, visibility="private", lab_id=None):
    return {"name": name, "date_created": "2026-08-15", "visibility": visibility, "lab_id": lab_id}


async def _create_hyp(client, name, visibility="private", lab_id=None):
    r = await client.post("/api/v1/hypotheses/", json=_hyp_body(name, visibility, lab_id))
    assert r.status_code == 201, r.text
    return r.json()


async def _link(client, a, b):
    last = None
    for lt in ("связано", "related"):  # словарь типов связи зависит от пары записей
        last = await client.post(f"{GRAPH}/links", params={
            "from_type": "hypothesis", "from_id": a, "to_type": "hypothesis", "to_id": b, "link_type": lt})
        if last.status_code == 200:
            return lt
    raise AssertionError(f"не удалось создать связь: {last.status_code} {last.text}")


async def _feed(client, url):
    r = await client.get(url)
    assert r.status_code == 200, r.text
    return r.json()


def _gkeys(g):
    return {(g["core"]["type"], g["core"]["entity_id"])} | {(m["item"]["type"], m["item"]["entity_id"]) for m in g["members"]}


def _keys(page):
    return set().union(*[_gkeys(g) for g in page["groups"]]) if page["groups"] else set()


def _group_of(page, key):
    return next((g for g in page["groups"] if key in _gkeys(g)), None)


@pytest.mark.asyncio
async def test_entity_moved_out_of_lab_leaves_lab_feed(client):
    owner = await create_test_user("fgs_owner2")
    member = await create_test_user("fgs_member2")
    await _login(client, "fgs_owner2")
    lab = await _create_lab(client, "Feed groups stale lab")
    hyp = await _create_hyp(client, "Lab hyp", visibility="lab", lab_id=lab["id"])
    await add_lab_member(lab["id"], member.id)
    url = f"/api/v1/feed/groups/lab/{lab['id']}?page_size=50"

    await _login(client, "fgs_member2")
    assert ("hypothesis", hyp["id"]) in _keys(await _feed(client, url)), "предусловие: запись лабы видна участнику"

    await _login(client, "fgs_owner2")
    r = await client.put(f"/api/v1/hypotheses/{hyp['id']}", json=_hyp_body("Lab hyp", "private", None))
    assert r.status_code == 200, r.text

    await _login(client, "fgs_member2")
    assert ("hypothesis", hyp["id"]) not in _keys(await _feed(client, url)), "запись, вышедшая из лаборатории, осталась в её ленте"


@pytest.mark.asyncio
async def test_removed_link_splits_the_card(client):
    await create_test_user("fgs_owner3")
    await _login(client, "fgs_owner3")
    a = await _create_hyp(client, "Link A", visibility="public")
    b = await _create_hyp(client, "Link B", visibility="public")
    ka, kb = ("hypothesis", a["id"]), ("hypothesis", b["id"])
    await _link(client, a["id"], b["id"])
    url = "/api/v1/feed/groups/public?page_size=50"

    g = _group_of(await _feed(client, url), ka)
    assert g is not None and kb in _gkeys(g), "предусловие: связанные записи — одна карточка"

    r = await client.delete(f"{GRAPH}/links", params={
        "from_type": "hypothesis", "from_id": a["id"], "to_type": "hypothesis", "to_id": b["id"]})
    assert r.status_code == 200, r.text

    after = await _feed(client, url)
    ga, gb = _group_of(after, ka), _group_of(after, kb)
    assert ga is not None and gb is not None and ga["key"] != gb["key"], "без связи это две карточки"
    assert kb not in _gkeys(ga)


@pytest.mark.asyncio
async def test_private_neighbour_of_a_public_record_does_not_leak(client):
    await create_test_user("fgs_owner4")
    await _login(client, "fgs_owner4")
    a = await _create_hyp(client, "Public side", visibility="public")
    b = await _create_hyp(client, "SECRET-TITLE-XYZ", visibility="private")
    await _link(client, a["id"], b["id"])

    feed = await _feed(client, "/api/v1/feed/groups/public?page_size=50")
    g = _group_of(feed, ("hypothesis", a["id"]))
    assert g is not None, "предусловие: публичная запись видна в ленте"
    assert g["members"] == [] and g["outside"] == []
    assert ("hypothesis", b["id"]) not in _keys(feed)
    assert "SECRET-TITLE-XYZ" not in json.dumps(feed, ensure_ascii=False), "название приватной записи утекло в публичную ленту"
