"""Граф лаборатории: открытые через связь записи показываются только по запросу (include_opened) и помечены opened."""
import pytest

from tests.test_open_via_link import _link, _login, _world


async def _graph(client, lab, **params):
    r = await client.get(f"/api/v1/graph/lab/{lab}", params=params)
    assert r.status_code == 200, r.text
    return {n["id"]: n for n in r.json()["nodes"]}


@pytest.mark.asyncio
async def test_opened_record_is_in_lab_graph_only_on_request(client):
    a, b, c, lab, r, n = await _world(client)
    await _link(a.id, n, r)
    await _login(client, "ov_b")
    plain = await _graph(client, lab)
    assert f"o_{r}" in plain and f"o_{n}" not in plain          # контроль: лабораторная есть, открытой нет
    full = await _graph(client, lab, include_opened="true")
    assert full[f"o_{n}"]["opened"] is True
    assert not full[f"o_{r}"].get("opened")


@pytest.mark.asyncio
async def test_without_consent_nothing_is_added(client):
    """ОХРАННЫЙ (зелёный и до патча): связь есть, согласия нет."""
    a, b, c, lab, r, n = await _world(client)
    from app.db.session import AsyncSessionLocal
    from app.models.entities import Link
    async with AsyncSessionLocal() as db:
        db.add(Link(user_id=a.id, from_type="observation", from_id=n, to_type="observation", to_id=r, link_type="связано"))
        await db.commit()
    await _login(client, "ov_b")
    assert f"o_{n}" not in await _graph(client, lab, include_opened="true")
