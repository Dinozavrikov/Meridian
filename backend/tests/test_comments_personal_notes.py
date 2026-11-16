"""Личные заметки владельца на публичной/лабораторной записи (комментарий владельца без позиции и ответы на него)
не видны никому, кроме него, и не входят в счётчик обсуждения. Раньше get_comments и счётчик ленты отдавали всё."""
import pytest

from tests.conftest import create_test_user
from tests.test_feed_groups_api import _get, _group_of, _login, _rec

COMMENTS = "/api/v1/comments"


async def _say(client, t, i, text, **kw):
    r = await client.post(f"{COMMENTS}/{t}/{i}", json={"content": text, **kw})
    assert r.status_code == 200, r.text
    return r.json()


async def _read(client, t, i):
    r = await client.get(f"{COMMENTS}/{t}/{i}")
    assert r.status_code == 200, r.text
    out = []

    def walk(xs):
        for c in xs:
            out.append(c["content"])
            walk(c["replies"])
    walk(r.json())
    return out


async def _setup(client, tag):
    owner = await create_test_user(f"pn_own_{tag}")
    guest = await create_test_user(f"pn_gst_{tag}")
    h = ("hypothesis", await _rec("hypothesis", owner.id, visibility="public"))
    await _login(client, owner.username)
    note = await _say(client, *h, "NOTE-SELF")
    await _say(client, *h, "NOTE-SELF-REPLY", parent_id=note["id"])
    await _login(client, guest.username)
    await _say(client, *h, "DISCUSS-1", stance="confirm")
    return owner, guest, h


@pytest.mark.asyncio
async def test_other_viewer_does_not_see_owner_personal_notes_nor_replies_to_them(client):
    owner, guest, h = await _setup(client, "a")
    assert await _read(client, *h) == ["DISCUSS-1"]


@pytest.mark.asyncio
async def test_owner_still_sees_everything_in_default_view(client):
    owner, guest, h = await _setup(client, "b")
    await _login(client, owner.username)
    assert set(await _read(client, *h)) == {"NOTE-SELF", "NOTE-SELF-REPLY", "DISCUSS-1"}


@pytest.mark.asyncio
async def test_comment_count_in_feed_and_on_entity_card_counts_only_discussion(client):
    owner, guest, h = await _setup(client, "c")
    assert _group_of(await _get(client), h)["core"]["comment_count"] == 1
    r = await client.get(f"/api/v1/feed/groups/entity/{h[0]}/{h[1]}")
    assert r.status_code == 200, r.text
    assert r.json()["core"]["comment_count"] == 1


@pytest.mark.asyncio
async def test_translation_lookup_does_not_open_personal_note_or_its_replies_to_other_viewer(client):
    from app.core.translatable_resolvers import _load
    from tests.conftest import AsyncSessionLocal
    owner = await create_test_user("pn_own_t")
    guest = await create_test_user("pn_gst_t")
    h = ("hypothesis", await _rec("hypothesis", owner.id, visibility="public"))
    await _login(client, owner.username)
    note = await _say(client, *h, "NOTE-SELF")
    reply = await _say(client, *h, "NOTE-SELF-REPLY", parent_id=note["id"])
    await _login(client, guest.username)
    disc = await _say(client, *h, "DISCUSS-1", stance="confirm")
    async with AsyncSessionLocal() as db:
        assert await _load(db, guest, "comment", disc["id"]) is not None, "предусловие: обсуждение переводимо"
        assert await _load(db, owner, "comment", note["id"]) is not None, "владельцу своя заметка доступна"
        assert await _load(db, guest, "comment", note["id"]) is None
        assert await _load(db, guest, "comment", reply["id"]) is None


@pytest.mark.asyncio
async def test_other_viewer_cannot_reply_under_a_hidden_personal_note(client):
    owner, guest, h = await _setup(client, "d")
    await _login(client, owner.username)
    note = await _say(client, *h, "NOTE-2")
    await _login(client, guest.username)
    r = await client.post(f"{COMMENTS}/{h[0]}/{h[1]}", json={"content": "X", "parent_id": note["id"], "stance": "confirm"})
    assert r.status_code == 400, r.text


@pytest.mark.asyncio
async def test_lab_checkpoint_does_not_copy_owner_personal_notes(client):
    from app.services.lab_checkpoints import collect_items
    from tests.conftest import AsyncSessionLocal, add_lab_member
    from tests.test_feed_groups_api import _create_lab
    owner = await create_test_user("pn_own_cp")
    member = await create_test_user("pn_mem_cp")
    await _login(client, owner.username)
    lab = await _create_lab(client, "PN lab", False)
    await add_lab_member(lab["id"], member.id)
    o = ("observation", await _rec("observation", owner.id, visibility="lab", lab_id=lab["id"]))
    note = await _say(client, *o, "NOTE-SELF")
    await _say(client, *o, "NOTE-SELF-REPLY", parent_id=note["id"])
    await _login(client, member.username)
    await _say(client, *o, "DISCUSS-1", stance="confirm")
    async with AsyncSessionLocal() as db:
        items = await collect_items(db, lab["id"])
    dump = " ".join(str(i.data) for i in items if i.kind == "comment")
    assert "DISCUSS-1" in dump, "предусловие: обсуждение в снимок входит"
    assert "NOTE-SELF" not in dump
