"""Виджет «разнообразие доказательств» читается участнику для гипотезы, открытой через связь; постороннему отказ."""
import pytest

from tests.test_open_via_link import _login, _world
from tests.test_open_via_link_sources import _mk_hyp


async def _setup(client):
    a, b, c, lab, r, n = await _world(client)          # залогинен ov_a
    h = await _mk_hyp(client)                           # приватная гипотеза автора
    resp = await client.post("/api/v1/graph/links", params={
        "from_type": "hypothesis", "from_id": h, "to_type": "observation", "to_id": r, "link_type": "связано", "share": "lab"})
    assert resp.status_code in (200, 201), resp.text
    return h


@pytest.mark.asyncio
async def test_member_reads_diversity_of_opened_hypothesis(client):
    h = await _setup(client)
    await _login(client, "ov_b")
    assert (await client.get(f"/api/v1/hypotheses/{h}")).status_code == 200      # фикстура: гипотеза действительно открыта
    resp = await client.get(f"/api/v1/hypotheses/{h}/evidence-diversity")
    assert resp.status_code == 200, resp.text            # КРАСНЫЙ на старом коде: сейчас 403
    assert set(resp.json()) == {"confirming", "refuting", "computed_at"}, resp.json()


@pytest.mark.asyncio
async def test_outsider_still_denied_diversity(client):
    """ОХРАННЫЙ (зелёный до патча)."""
    h = await _setup(client)
    await _login(client, "ov_s")
    assert (await client.get(f"/api/v1/hypotheses/{h}/evidence-diversity")).status_code in (403, 404)
