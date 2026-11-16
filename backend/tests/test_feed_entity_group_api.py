"""Карточка одной записи (GET /feed/groups/entity/{type}/{id}) — для страницы обсуждения: запись целиком в центре, все её
прямые связи, соседи не шире самой записи. Плюс флаги перевода у ссылок «Ещё связано с» в ленте."""
import json
from datetime import datetime, timezone

import pytest

from app.models.entities import EntityHypothesis
from tests.conftest import AsyncSessionLocal, add_lab_member, create_test_user
from tests.test_feed_groups_api import _create_lab, _get, _group_of, _link, _login, _note, _rec, _set


def _url(t, i):
    return f"/api/v1/feed/groups/entity/{t}/{i}"


async def _card(client, t, i):
    r = await client.get(_url(t, i))
    assert r.status_code == 200, r.text
    return r.json()


def _members(card):
    return {(m["item"]["type"], m["item"]["entity_id"]): m["relation"] for m in card["members"]}


@pytest.mark.asyncio
async def test_card_has_full_text_and_every_direct_neighbour_for_a_guest(client):
    u = await create_test_user("eg_u1")
    long_text = "полный текст " * 100
    h = ("hypothesis", await _rec("hypothesis", u.id, visibility="public", description=long_text))
    o1, o2, o3 = [("observation", await _rec("observation", u.id, visibility="public")) for _ in range(3)]
    await _link(u.id, o1, h, "подтверждает"); await _link(u.id, o2, h, "опровергает"); await _link(u.id, o3, h)
    card = await _card(client, *h)
    assert (card["core"]["type"], card["core"]["entity_id"]) == h
    assert card["core"]["preview"] == long_text, "на странице записи текст целиком (в ленте он обрезан до 256 символов)"
    assert _members(card) == {o1: "подтверждает", o2: "опровергает", o3: "связано"}
    assert card["outside"] == [] and card["size"] == 4


@pytest.mark.asyncio
async def test_record_that_is_a_member_in_the_feed_is_the_centre_of_its_own_card(client):
    u = await create_test_user("eg_u2")
    h = ("hypothesis", await _rec("hypothesis", u.id, visibility="public"))
    o, q, r_, p = [("observation", await _rec("observation", u.id, visibility="public")) for _ in range(4)]
    for x in (o, q, r_):
        await _link(u.id, x, h)
    await _link(u.id, o, p)
    assert _group_of(await _get(client), o)["core"]["entity_id"] == h[1], "предусловие: в ленте наблюдение — спутник гипотезы"
    card = await _card(client, *o)
    assert (card["core"]["type"], card["core"]["entity_id"]) == o
    assert set(_members(card)) == {h, p}


@pytest.mark.asyncio
async def test_private_and_trashed_neighbours_are_hidden_and_do_not_leak(client):
    u = await create_test_user("eg_u3")
    h = ("hypothesis", await _rec("hypothesis", u.id, visibility="public"))
    pub = ("observation", await _rec("observation", u.id, visibility="public"))
    priv = ("observation", await _rec("observation", u.id, visibility="private", title="SECRET-N-ZZ"))
    gone = ("observation", await _rec("observation", u.id, visibility="public", title="TRASH-N-ZZ",
                                      deleted_at=datetime.now(timezone.utc)))
    for x in (pub, priv, gone):
        await _link(u.id, x, h)
    card = await _card(client, *h)
    assert set(_members(card)) == {pub}
    dumped = json.dumps(card, ensure_ascii=False)
    assert "SECRET-N-ZZ" not in dumped and "TRASH-N-ZZ" not in dumped


@pytest.mark.asyncio
async def test_private_record_has_no_card_and_unknown_type_is_rejected(client):
    u = await create_test_user("eg_u4")
    await _login(client, "eg_u4")
    priv = ("hypothesis", await _rec("hypothesis", u.id, visibility="private"))
    assert (await client.get(_url(*priv))).status_code == 404, "даже владельцу: личная запись публичной карточки не имеет"
    client.cookies.clear()
    assert (await client.get(_url(*priv))).status_code == 404
    assert (await client.get(_url("banana", 1))).status_code == 400


@pytest.mark.asyncio
async def test_record_made_private_loses_its_card(client):
    u = await create_test_user("eg_u5")
    await _login(client, "eg_u5")
    h = ("hypothesis", await _rec("hypothesis", u.id, visibility="public"))
    assert (await client.get(_url(*h))).status_code == 200, "предусловие: карточка есть"
    assert (await client.put(f"/api/v1/hypothesis/{h[1]}/visibility", json={"visibility": "private"})).status_code == 200
    assert (await client.get(_url(*h))).status_code == 404


@pytest.mark.asyncio
async def test_lab_record_card_is_for_members_and_neighbours_are_not_wider_than_the_record(client):
    owner = await create_test_user("eg_own7")
    member = await create_test_user("eg_mem7")
    await create_test_user("eg_out7")
    await _login(client, "eg_own7")
    lab = await _create_lab(client, "EG lab 7", False)
    lab2 = await _create_lab(client, "EG lab 7b", False)
    await add_lab_member(lab["id"], member.id)
    h = ("hypothesis", await _rec("hypothesis", owner.id, visibility="lab"))
    await _set("hypothesis", h[1], lab_id=lab["id"])
    same = ("observation", await _rec("observation", owner.id, visibility="lab", lab_id=lab["id"]))
    pub = ("observation", await _rec("observation", owner.id, visibility="public"))
    other = ("observation", await _rec("observation", owner.id, visibility="lab", lab_id=lab2["id"], title="OTHER-LAB-ZZ"))
    priv = ("observation", await _rec("observation", owner.id, visibility="private", title="PRIV-ZZ"))
    for x in (same, pub, other, priv):
        await _link(owner.id, x, h)

    await _login(client, "eg_mem7")
    card = await _card(client, *h)
    assert set(_members(card)) == {same, pub}
    assert "OTHER-LAB-ZZ" not in json.dumps(card, ensure_ascii=False) and "PRIV-ZZ" not in json.dumps(card, ensure_ascii=False)

    await _login(client, "eg_out7")
    assert (await client.get(_url(*h))).status_code == 404
    client.cookies.clear()
    assert (await client.get(_url(*h))).status_code == 404


@pytest.mark.asyncio
async def test_all_notes_of_an_observation_and_links_between_neighbours(client):
    u = await create_test_user("eg_u8")
    await _login(client, "eg_u8")
    o = ("observation", await _rec("observation", u.id, visibility="public"))
    for i in range(4):
        await _note(client, o[1], f"NOTE-{i}")
    card = await _card(client, *o)
    assert card["core"]["note_count"] == 4 and len(card["core"]["notes"]) == 4, "на странице все заметки, в ленте — последние три"

    h = ("hypothesis", await _rec("hypothesis", u.id, visibility="public"))
    a, b = [("observation", await _rec("observation", u.id, visibility="public", title=f"NB-{i}")) for i in range(2)]
    await _link(u.id, a, h); await _link(u.id, b, h); await _link(u.id, a, b, "подтверждает")
    card = await _card(client, *h)
    assert len(card["internal"]) == 1 and card["internal"][0]["kind"] == "подтверждает"
    assert {card["internal"][0]["a"]["title"], card["internal"][0]["b"]["title"]} == {"NB-0", "NB-1"}


@pytest.mark.asyncio
async def test_competing_hypothesis_edge_shows_on_both_cards(client):
    u = await create_test_user("eg_u9")
    h = ("hypothesis", await _rec("hypothesis", u.id, visibility="public"))
    t = ("task", await _rec("task", u.id, visibility="public"))
    async with AsyncSessionLocal() as s:
        s.add(EntityHypothesis(parent_type="task", parent_id=t[1], hypothesis_id=h[1], stance="подтверждает"))
        await s.commit()
    assert _members(await _card(client, *t)) == {h: "подтверждает"}
    assert _members(await _card(client, *h)) == {t: "подтверждает"}


@pytest.mark.asyncio
async def test_feed_outside_refs_tell_whether_the_title_is_translatable_and_whose_it_is(client):
    """Ссылки «Ещё связано с» в ленте: перевод возможен только для настоящего заголовка и только для чужой записи."""
    u = await create_test_user("eg_u10")
    wv = ("worldview", await _rec("worldview", u.id, visibility="public"))
    o1, o2, o3 = [("observation", await _rec("observation", u.id, visibility="public")) for _ in range(3)]
    await _link(u.id, wv, o1); await _link(u.id, o1, o2); await _link(u.id, o2, o3)
    page = await _get(client)
    refs = [r for g in page["groups"] for r in g["outside"]]
    assert refs, "предусловие: у цепочки есть связи между карточками"
    assert {r["author_username"] for r in refs} == {u.username}
    for r in refs:
        assert r["translatable"] is (r["type"] != "worldview"), r
    assert any(r["type"] == "worldview" and not r["translatable"] for r in refs), "у мировоззрения нет заголовка"
    assert any(r["type"] == "observation" and r["translatable"] for r in refs), "у наблюдения заголовок настоящий"
