"""Событие visibility_changed: публикация поднимает запись в ленте-группах и не рождает второй карточки."""
import pytest
from sqlalchemy import select
from app.models.entities import Event
from tests.conftest import AsyncSessionLocal, create_test_user
from tests.test_soft_delete_read_d import TYPES
from tests.test_feed_groups_api import _create_hyp, _create_lab, _get, _hyp_body, _login, _rec


async def _events(etype, eid):
    async with AsyncSessionLocal() as s:
        return (await s.execute(select(Event).where(
            Event.type == "visibility_changed", Event.entity_type == etype, Event.entity_id == eid
        ).order_by(Event.id))).scalars().all()


def _order(page, etype=None):
    keys = [(g["core"]["type"], g["core"]["entity_id"]) for g in page["groups"]]
    return [k for k in keys if etype is None or k[0] == etype]


def _vis(etype, eid):
    return f"/api/v1/{etype}/{eid}/visibility"


@pytest.mark.asyncio
@pytest.mark.parametrize("etype", TYPES)
async def test_publishing_raises_the_card_and_writes_one_event(client, etype):
    u = await create_test_user(f"vc_{etype}")
    await _login(client, u.username)
    old = (etype, await _rec(etype, u.id, visibility="private"))
    new = (etype, await _rec(etype, u.id, visibility="public"))
    assert _order(await _get(client), etype) == [new], "предусловие: видна только публичная запись"
    r = await client.put(_vis(*old), json={"visibility": "public"})
    assert r.status_code == 200, r.text
    assert _order(await _get(client), etype) == [old, new], "опубликованная запись должна подняться выше более новой"
    evs = await _events(*old)
    assert len(evs) == 1 and evs[0].visibility == "public" and evs[0].meta["old_visibility"] == "private"


@pytest.mark.asyncio
async def test_publishing_does_not_create_a_second_card(client):
    u = await create_test_user("vc_once")
    await _login(client, u.username)
    rec = ("observation", await _rec("observation", u.id, visibility="private"))
    assert (await client.put(_vis(*rec), json={"visibility": "public"})).status_code == 200
    assert len(await _events(*rec)) == 1, "предусловие: событие записано"
    page = await _get(client)
    assert _order(page) == [rec] and page["total"] == 1, "событие поднимает запись, а не рождает вторую карточку"


@pytest.mark.asyncio
async def test_hiding_a_record_leaves_no_trace_in_public_feed(client):
    u = await create_test_user("vc_hide")
    await _login(client, u.username)
    rec = ("observation", await _rec("observation", u.id, visibility="public"))
    assert _order(await _get(client)) == [rec], "предусловие: запись видна"
    assert (await client.put(_vis(*rec), json={"visibility": "private"})).status_code == 200
    assert (await _get(client))["groups"] == []
    evs = await _events(*rec)
    assert len(evs) == 1 and evs[0].visibility == "private" and evs[0].lab_id is None


@pytest.mark.asyncio
async def test_noop_visibility_change_writes_no_event(client):
    u = await create_test_user("vc_noop")
    await _login(client, u.username)
    rec = ("observation", await _rec("observation", u.id, visibility="public"))
    assert (await client.put(_vis(*rec), json={"visibility": "public"})).status_code == 200
    assert await _events(*rec) == []


@pytest.mark.asyncio
async def test_full_put_writes_event_once_and_only_when_visibility_changes(client):
    await create_test_user("vc_put")
    await _login(client, "vc_put")
    hyp = await _create_hyp(client, "PUT vis", "private")
    assert (await client.put(f"/api/v1/hypotheses/{hyp['id']}", json=_hyp_body("PUT vis", "public"))).status_code == 200
    evs = await _events("hypothesis", hyp["id"])
    assert len(evs) == 1
    assert evs[0].meta == {"old_visibility": "private", "new_visibility": "public", "old_lab_id": None, "new_lab_id": None}
    assert (await client.put(f"/api/v1/hypotheses/{hyp['id']}", json=_hyp_body("PUT vis renamed", "public"))).status_code == 200
    assert len(await _events("hypothesis", hyp["id"])) == 1, "правка без смены видимости не должна писать событие"


@pytest.mark.asyncio
async def test_moving_into_lab_raises_the_card_in_that_labs_feed(client):
    u = await create_test_user("vc_lab")
    await _login(client, u.username)
    lab = await _create_lab(client, "VC lab", False)
    old = ("observation", await _rec("observation", u.id, visibility="private"))
    new = ("observation", await _rec("observation", u.id, visibility="lab", lab_id=lab["id"]))
    url = f"/api/v1/feed/groups/lab/{lab['id']}?page_size=50"
    assert _order(await _get(client, url), "observation") == [new], "предусловие: в ленте лабы только вторая запись"
    r = await client.put(_vis(*old), json={"visibility": "lab", "lab_id": lab["id"]})
    assert r.status_code == 200, r.text
    assert _order(await _get(client, url), "observation") == [old, new]
    ev = (await _events(*old))[0]
    assert ev.lab_id == lab["id"] and ev.visibility == "lab"
