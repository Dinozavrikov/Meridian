"""API ленты карточками-группами: видимость читается у самой записи, одна запись — одна карточка."""
import json
import pytest
from sqlalchemy import select, func
from app.core.entity_registry import ENTITY_MODELS
from app.models.entities import Event, EntityHypothesis, Link
from tests.conftest import AsyncSessionLocal, add_lab_member, create_test_user
from tests.test_soft_delete_read_d import _mk
import itertools

_seq = itertools.count(1)


async def _rec(etype, uid, _unused="", **attrs):
    """_mk даёт фиксированный slug на тип (d3-<type>): вторую такую запись в тесте не создать — добавляем уникальный суффикс."""
    return await _mk(etype, uid, f"-{next(_seq)}", **attrs)

PUB = "/api/v1/feed/groups/public?page_size=50"


async def _login(client, username, password="pass12345"):
    r = await client.post("/api/v1/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200


def _hyp_body(name, visibility="private", **extra):
    return {"name": name, "date_created": "2026-08-15", "visibility": visibility, "lab_id": None, **extra}


async def _create_hyp(client, name, visibility="private", **extra):
    r = await client.post("/api/v1/hypotheses/", json=_hyp_body(name, visibility, **extra))
    assert r.status_code == 201, r.text
    return r.json()


async def _create_lab(client, name, is_public):
    r = await client.post("/api/v1/labs", json={"name": name, "is_public": is_public,
                                                "goal_type": "task", "new_goal_title": f"Goal {name}"})
    assert r.status_code == 200, r.text
    return r.json()


async def _set(etype, eid, **fields):
    async with AsyncSessionLocal() as s:
        o = await s.get(ENTITY_MODELS[etype], eid)
        for k, v in fields.items():
            setattr(o, k, v)
        await s.commit()


async def _link(user_id, a, b, kind="связано"):
    async with AsyncSessionLocal() as s:
        s.add(Link(user_id=user_id, from_type=a[0], from_id=a[1], to_type=b[0], to_id=b[1], link_type=kind))
        await s.commit()


async def _get(client, url=PUB):
    r = await client.get(url)
    assert r.status_code == 200, r.text
    return r.json()


def _flat(page):
    return [(x["type"], x["entity_id"]) for g in page["groups"] for x in [g["core"], *[m["item"] for m in g["members"]]]]


def _group_of(page, key):
    for g in page["groups"]:
        if key in [(x["type"], x["entity_id"]) for x in [g["core"], *[m["item"] for m in g["members"]]]]:
            return g
    return None


@pytest.mark.asyncio
async def test_hypothesis_with_observations_is_one_card_and_every_record_once(client):
    u = await create_test_user("fg_u1")
    h = ("hypothesis", await _rec("hypothesis", u.id, "", visibility="public"))
    o1, o2, o3 = [("observation", await _rec("observation", u.id, "", visibility="public")) for _ in range(3)]
    await _link(u.id, o1, h, "подтверждает")
    await _link(u.id, o2, h, "опровергает")
    page = await _get(client)
    flat = _flat(page)
    assert len(flat) == len(set(flat)), "запись показана дважды"
    assert {h, o1, o2, o3} <= set(flat)
    g = _group_of(page, h)
    assert (g["core"]["type"], g["core"]["entity_id"]) == h
    assert {(m["item"]["type"], m["item"]["entity_id"]): m["relation"] for m in g["members"]} == {
        o1: "подтверждает", o2: "опровергает"}
    assert _group_of(page, o3)["size"] == 1, "несвязанное наблюдение — отдельная карточка"


@pytest.mark.asyncio
async def test_status_change_does_not_create_a_second_card(client):
    """Раньше смена статуса давала вторую карточку той же записи (события)."""
    u = await create_test_user("fg_u2")
    await _login(client, "fg_u2")
    hyp = await _create_hyp(client, "Status hyp", "public")
    r = await client.put(f"/api/v1/hypotheses/{hyp['id']}", json=_hyp_body("Status hyp", "public", status="активная проверка"))
    assert r.status_code == 200, r.text
    async with AsyncSessionLocal() as s:
        n = await s.scalar(select(func.count()).select_from(Event).where(
            Event.entity_type == "hypothesis", Event.entity_id == hyp["id"], Event.type == "status_changed"))
    assert n == 1, "предусловие: событие смены статуса было"
    assert _flat(await _get(client)).count(("hypothesis", hyp["id"])) == 1


@pytest.mark.asyncio
async def test_private_record_does_not_bridge_two_public_cards_and_its_title_does_not_leak(client):
    u = await create_test_user("fg_u3")
    a, b, p = [("hypothesis", await _rec("hypothesis", u.id, "", visibility=v)) for v in ("public", "public", "private")]
    await _set("hypothesis", p[1], name="SECRET-BRIDGE-XYZ")
    await _link(u.id, a, p)
    await _link(u.id, p, b)
    page = await _get(client)
    assert _group_of(page, a) is not None and _group_of(page, b) is not None
    assert _group_of(page, a)["key"] != _group_of(page, b)["key"], "приватная запись склеила чужие карточки"
    assert p not in _flat(page)
    assert "SECRET-BRIDGE-XYZ" not in json.dumps(page, ensure_ascii=False)


@pytest.mark.asyncio
async def test_record_made_private_leaves_the_feed(client):
    await create_test_user("fg_u4")
    await _login(client, "fg_u4")
    hyp = await _create_hyp(client, "Going private", "public")
    assert ("hypothesis", hyp["id"]) in _flat(await _get(client)), "предусловие: запись видна"
    assert (await client.put(f"/api/v1/hypotheses/{hyp['id']}", json=_hyp_body("Going private", "private"))).status_code == 200
    assert ("hypothesis", hyp["id"]) not in _flat(await _get(client))


@pytest.mark.asyncio
async def test_trashed_record_leaves_the_feed_and_returns_on_restore(client):
    await create_test_user("fg_u5")
    await _login(client, "fg_u5")
    hyp = await _create_hyp(client, "To trash", "public")
    key = ("hypothesis", hyp["id"])
    assert key in _flat(await _get(client)), "предусловие: запись видна"
    assert (await client.delete(f"/api/v1/hypotheses/{hyp['id']}")).status_code == 204
    assert key not in _flat(await _get(client))
    assert (await client.post(f"/api/v1/hypothesis/{hyp['id']}/restore")).status_code == 204
    assert key in _flat(await _get(client))


@pytest.mark.asyncio
async def test_link_between_cards_is_visible_as_outside_on_both_sides(client):
    u = await create_test_user("fg_u6")
    o = [("observation", await _rec("observation", u.id, "", visibility="public")) for _ in range(4)]
    for x, y in zip(o, o[1:]):
        await _link(u.id, x, y)
    page = await _get(client)
    groups = [_group_of(page, k) for k in o]
    assert sorted({g["size"] for g in groups}) == [1, 3]
    big = next(g for g in groups if g["size"] == 3)
    small = next(g for g in groups if g["size"] == 1)
    small_key = (small["core"]["type"], small["core"]["entity_id"])
    assert [(r["type"], r["entity_id"]) for r in big["outside"]] == [small_key]
    assert len(small["outside"]) == 1 and (small["outside"][0]["type"], small["outside"][0]["entity_id"]) in _flat(
        {"groups": [big]})


@pytest.mark.asyncio
async def test_competing_hypothesis_edge_joins_task_and_hypothesis_in_one_card(client):
    u = await create_test_user("fg_u7")
    h = ("hypothesis", await _rec("hypothesis", u.id, "", visibility="public"))
    t = ("task", await _rec("task", u.id, "", visibility="public"))
    async with AsyncSessionLocal() as s:
        s.add(EntityHypothesis(parent_type="task", parent_id=t[1], hypothesis_id=h[1], stance="подтверждает"))
        await s.commit()
    g = _group_of(await _get(client), t)
    assert (g["core"]["type"], g["core"]["entity_id"]) == h
    assert [(m["item"]["type"], m["relation"]) for m in g["members"]] == [("task", "подтверждает")]


@pytest.mark.asyncio
async def test_topics_are_public_with_the_record_and_filter_works(client):
    await create_test_user("fg_u8")
    await _login(client, "fg_u8")
    h1 = await _create_hyp(client, "Tagged alpha", "public", tags=["Alpha"])
    h2 = await _create_hyp(client, "Tagged beta", "public", tags=["beta"])
    client.cookies.clear()   # гость: теги публичной записи видны и ему
    page = await _get(client)
    assert {"name": "alpha", "count": 1} in page["topics"] and {"name": "beta", "count": 1} in page["topics"]
    assert _group_of(page, ("hypothesis", h1["id"]))["topics"] == ["alpha"]
    flt = _flat(await _get(client, PUB + "&topic=ALPHA"))
    assert ("hypothesis", h1["id"]) in flt and ("hypothesis", h2["id"]) not in flt


@pytest.mark.asyncio
async def test_pagination_returns_every_card_once(client):
    u = await create_test_user("fg_u9")
    mine = {("observation", await _rec("observation", u.id, "", visibility="public")) for _ in range(5)}
    seen, page_no = [], 1
    while True:
        p = await _get(client, f"/api/v1/feed/groups/public?page_size=2&page={page_no}")
        seen += _flat(p)
        if page_no >= p["total_pages"]:
            break
        page_no += 1
    assert len(seen) == len(set(seen)), "карточка попала на две страницы"
    assert mine <= set(seen)


@pytest.mark.asyncio
async def test_lab_feed_shows_non_member_of_public_lab_only_public_records(client):
    owner = await create_test_user("fg_own10")
    outsider = await create_test_user("fg_out10")
    member = await create_test_user("fg_mem10")
    await _login(client, "fg_own10")
    lab = await _create_lab(client, "Public lab 10", True)
    await add_lab_member(lab["id"], member.id)
    hl = ("hypothesis", await _rec("hypothesis", owner.id, "", visibility="lab"))
    hp = ("hypothesis", await _rec("hypothesis", owner.id, "", visibility="public"))
    for k in (hl, hp):
        await _set("hypothesis", k[1], lab_id=lab["id"])
    url = f"/api/v1/feed/groups/lab/{lab['id']}?page_size=50"
    await _login(client, "fg_out10")
    out = _flat(await _get(client, url))
    assert hp in out and hl not in out, "не-участник увидел запись, отданную только лаборатории"
    await _login(client, "fg_mem10")
    assert {hl, hp} <= set(_flat(await _get(client, url)))


@pytest.mark.asyncio
async def test_private_lab_feed_is_forbidden_for_outsider(client):
    await create_test_user("fg_own11")
    await create_test_user("fg_out11")
    await _login(client, "fg_own11")
    lab = await _create_lab(client, "Private lab 11", False)
    await _login(client, "fg_out11")
    assert (await client.get(f"/api/v1/feed/groups/lab/{lab['id']}")).status_code == 403


async def _note(client, obs_id, text):
    r = await client.post(f"/api/v1/feed/observation/{obs_id}/posts", json={"title": "T", "content": text})
    assert r.status_code == 200, r.text


def _obs_order(page):
    return [g["core"]["entity_id"] for g in page["groups"] if g["core"]["type"] == "observation"]


@pytest.mark.asyncio
async def test_note_shows_in_observation_card_and_raises_it(client):
    u = await create_test_user("fg_n1")
    await _login(client, "fg_n1")
    a = await _rec("observation", u.id, visibility="public")
    b = await _rec("observation", u.id, visibility="public")
    order = _obs_order(await _get(client))
    assert order.index(b) < order.index(a), "предусловие: более новое наблюдение выше"
    await _note(client, a, "NOTE-TEXT-A")
    page = await _get(client)
    order = _obs_order(page)
    assert order.index(a) < order.index(b), "новая заметка должна поднимать карточку"
    core = _group_of(page, ("observation", a))["core"]
    assert core["note_count"] == 1 and "NOTE-TEXT-A" in core["notes"][0]["preview"]


@pytest.mark.asyncio
async def test_note_of_observation_made_private_does_not_leak(client):
    u = await create_test_user("fg_n2")
    await _login(client, "fg_n2")
    a = await _rec("observation", u.id, visibility="public")
    await _note(client, a, "NOTE-SECRET-ZZZ")
    assert "NOTE-SECRET-ZZZ" in json.dumps(await _get(client), ensure_ascii=False), "предусловие: заметка видна"
    await _set("observation", a, visibility="private")
    assert "NOTE-SECRET-ZZZ" not in json.dumps(await _get(client), ensure_ascii=False)


@pytest.mark.asyncio
async def test_card_shows_only_latest_notes_but_counts_all(client):
    u = await create_test_user("fg_n3")
    await _login(client, "fg_n3")
    a = await _rec("observation", u.id, visibility="public")
    for i in range(4):
        await _note(client, a, f"NOTE-{i}")
    core = _group_of(await _get(client), ("observation", a))["core"]
    assert core["note_count"] == 4 and len(core["notes"]) == 3
    assert "NOTE-3" in core["notes"][0]["preview"], "первой должна идти самая свежая"


@pytest.mark.asyncio
async def test_record_trashed_after_grouping_never_reaches_the_response(client, monkeypatch):
    """Запись удалили между сбором узлов и сборкой карточек: группировка её ещё помнит, ответ — нет."""
    from datetime import datetime, timezone
    import app.api.v1.feed as feed_mod
    from app.services.feed_groups import Group, build_groups

    u = await create_test_user("fg_race")
    host = ("hypothesis", await _rec("hypothesis", u.id, visibility="public"))
    ghost = ("observation", await _rec("observation", u.id, visibility="public",
                                       title="GHOST-TITLE-QQ", deleted_at=datetime.now(timezone.utc)))

    def with_ghosts(nodes, edges):
        real = [g for g in build_groups(nodes, edges) if g.core != host]
        ts = datetime.now(timezone.utc)
        return real + [
            Group(core=ghost, members=(), activity=ts, relation={}, size=1, outside=(), internal=()),
            Group(core=host, members=(ghost,), activity=ts, relation={ghost: "связано"}, size=2,
                  outside=(ghost,), internal=((ghost, ghost, "подтверждает"),)),
        ]

    monkeypatch.setattr(feed_mod, "build_groups", with_ghosts)
    page = await _get(client)
    assert ghost not in _flat(page), "удалённая запись попала в ленту отдельной карточкой"
    assert "GHOST-TITLE-QQ" not in json.dumps(page, ensure_ascii=False)
    g = _group_of(page, host)
    assert g is not None and g["members"] == [] and g["outside"] == [] and g["internal"] == []
