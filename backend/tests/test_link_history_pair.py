"""link-history с фильтром пары записей (other_type + other_id): «Вернуть» находит событие, даже когда у записи
накопилось больше событий, чем окно limit. Без фильтра поведение прежнее."""
import pytest

from tests.conftest import create_test_user
from tests.test_link_effect import _hyp, _link, _login, _obs

URL = "/api/v1/hypothesis/{h}/link-history"


async def _hist(client, h, **params):
    return await client.get(URL.format(h=h), params=params)


async def _setup(client, name):
    await create_test_user(name); await _login(client, name)
    return await _hyp(client)


async def _crowd(client, h):
    """Первая связь пары, затем 12 других связей: старое событие выпадает из окна limit=10."""
    first = await _obs(client, 5)
    await _link(client, "observation", first, "hypothesis", h, "подтверждает")
    for _ in range(12):
        await _link(client, "observation", await _obs(client, 5), "hypothesis", h, "подтверждает")
    return first


@pytest.mark.asyncio
async def test_default_window_misses_old_pair_event(client):
    """ОХРАННЫЙ (зелёный и до патча): без фильтра окно limit=10 не достаёт старого события пары. Это и есть проблема."""
    h = await _setup(client, "lp_a")
    first = await _crowd(client, h)
    r = await _hist(client, h, limit=10)
    assert r.status_code == 200, r.text
    assert first not in [i["other_id"] for i in r.json()]


@pytest.mark.asyncio
async def test_pair_filter_finds_old_event(client):
    h = await _setup(client, "lp_b")
    first = await _crowd(client, h)
    r = await _hist(client, h, limit=10, other_type="observation", other_id=first)
    assert r.status_code == 200, r.text
    items = r.json()
    assert items and all(i["other_type"] == "observation" and i["other_id"] == first for i in items)
    assert any(i["type"] == "linked" for i in items)


@pytest.mark.asyncio
async def test_pair_filter_unknown_pair_is_empty(client):
    h = await _setup(client, "lp_c")
    await _crowd(client, h)
    r = await _hist(client, h, other_type="observation", other_id=999999)
    assert r.status_code == 200 and r.json() == []


@pytest.mark.asyncio
async def test_pair_filter_needs_both_params(client):
    h = await _setup(client, "lp_d")
    assert (await _hist(client, h, other_type="observation")).status_code == 422
    assert (await _hist(client, h, other_id=1)).status_code == 422


@pytest.mark.asyncio
async def test_pair_filter_both_link_directions(client):
    h = await _setup(client, "lp_e")
    a = await _obs(client, 5); b = await _obs(client, 5)
    await _link(client, "observation", a, "hypothesis", h, "подтверждает")
    await _link(client, "hypothesis", h, "observation", b, "опровергает")
    for x in (a, b):
        items = (await _hist(client, h, other_type="observation", other_id=x)).json()
        assert items and {i["other_id"] for i in items} == {x}, x


@pytest.mark.asyncio
async def test_pair_filter_keeps_reverted_flag(client):
    """ОХРАННЫЙ (зелёный и до патча): после отката событие помечено reverted и при фильтре по паре."""
    h = await _setup(client, "lp_f")
    a = await _obs(client, 5)
    await _link(client, "observation", a, "hypothesis", h, "подтверждает")
    items = (await _hist(client, h, other_type="observation", other_id=a)).json()
    ev = next(i for i in items if i["type"] == "linked")
    r = await client.post(f"/api/v1/hypothesis/{h}/undo/{ev['id']}")
    assert r.status_code == 200, r.text
    after = (await _hist(client, h, other_type="observation", other_id=a)).json()
    assert next(i for i in after if i["id"] == ev["id"])["reverted"] is True
