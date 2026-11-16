"""Словарь типов связи по паре записей: создание и смена типа проверяют одно правило (allowed_link_types)."""
import pytest

from tests.test_link_same_type import _link, _post, _retype, _task, _two_hyps, _unlink
from tests.test_open_via_link import _world


async def _worldview(client):
    return await _post(client, "/api/v1/worldview/", {"date": "2026-09-28", "belief": "VOCAB belief", "visibility": "private"})


async def _hyp_worldview(client):
    await _world(client)
    h1, _ = await _two_hyps(client)
    return ("hypothesis", h1), ("worldview", await _worldview(client))


@pytest.mark.asyncio
@pytest.mark.parametrize("lt", ["strengthens", "challenges", "transforms", "contradicts", "связано"])
async def test_worldview_pair_accepts_influence_and_neutral(client, lt):
    """ОХРАННЫЙ (зелёный до патча): у убеждения свой словарь."""
    a, b = await _hyp_worldview(client)
    assert (await _link(client, a, b, lt)).status_code == 200
    assert await _unlink(client, a, b) == 1


@pytest.mark.asyncio
@pytest.mark.parametrize("lt", ["подтверждает", "опровергает"])
async def test_worldview_pair_rejects_evidence_types(client, lt):
    a, b = await _hyp_worldview(client)
    r = await _link(client, a, b, lt)
    assert r.status_code == 400, r.text                          # КРАСНЫЙ на старом коде
    assert await _unlink(client, a, b) == 0


@pytest.mark.asyncio
@pytest.mark.parametrize("lt", ["strengthens", "bogus"])
async def test_plain_pair_rejects_foreign_vocabulary(client, lt):
    """Влияние на убеждение и неизвестная строка между обычными записями не допускаются."""
    await _world(client)
    h1, _ = await _two_hyps(client)
    a, b = ("hypothesis", h1), ("task", await _task(client))
    r = await _link(client, a, b, lt)
    assert r.status_code == 400, r.text                          # КРАСНЫЙ на старом коде
    assert await _unlink(client, a, b) == 0


@pytest.mark.asyncio
async def test_same_type_pair_rejects_unknown_string(client):
    await _world(client)
    h1, h2 = await _two_hyps(client)
    r = await _link(client, ("hypothesis", h1), ("hypothesis", h2), "bogus")
    assert r.status_code == 400, r.text                          # КРАСНЫЙ на старом коде


@pytest.mark.asyncio
async def test_set_type_worldview_pair_accepts_influence_in_one_event_and_undo_keeps_link(client):
    a, b = await _hyp_worldview(client)
    assert (await _link(client, a, b, "связано")).status_code == 200
    r = await _retype(client, a, b, "challenges")
    assert r.status_code == 200, r.text                          # КРАСНЫЙ на старом коде: тип влияния не в LINK_TYPES
    hist = await client.get(f"/api/v1/hypothesis/{a[1]}/link-history")
    assert hist.status_code == 200, hist.text
    changed = [e for e in hist.json() if e["type"] == "link_type_changed"]
    assert len(changed) == 1                                      # одно событие, а не unlinked + linked
    undo = await client.post(f"/api/v1/hypothesis/{a[1]}/undo/{changed[0]['id']}")
    assert undo.status_code == 200, undo.text
    assert await _unlink(client, a, b) == 1                       # после отката связь на месте


@pytest.mark.asyncio
async def test_set_type_worldview_pair_rejects_evidence(client):
    a, b = await _hyp_worldview(client)
    assert (await _link(client, a, b, "связано")).status_code == 200
    r = await _retype(client, a, b, "подтверждает")
    assert r.status_code == 400, r.text                          # КРАСНЫЙ на старом коде


@pytest.mark.asyncio
async def test_set_type_plain_pair_rejects_influence(client):
    """ОХРАННЫЙ (зелёный до патча): после расширения общего списка вторая проверка (по паре) всё ещё держит."""
    await _world(client)
    h1, _ = await _two_hyps(client)
    a, b = ("hypothesis", h1), ("task", await _task(client))
    assert (await _link(client, a, b, "связано")).status_code == 200
    assert (await _retype(client, a, b, "strengthens")).status_code == 400
