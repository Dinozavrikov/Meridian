"""Ответ записи несёт access: owner / member / public / opened (opened = открыта через связь, только чтение)."""
import pytest

from app.schemas.entities import HypOut, ObsOut, PredOut, QuestionOut, TaskOut, WvOut
from tests.test_open_via_link import _login, _world
from tests.test_publication_share import _post_link
from tests.test_open_via_link_sources import _mk_hyp


@pytest.mark.parametrize("model", [ObsOut, HypOut, PredOut, WvOut, QuestionOut, TaskOut])
def test_all_six_schemas_have_access(model):
    assert "access" in model.model_fields        # КРАСНЫЙ на старом коде


async def _get(client, user, url):
    await _login(client, user)
    resp = await client.get(url)
    assert resp.status_code == 200, resp.text
    return resp.json()


@pytest.mark.asyncio
async def test_observation_access_values(client):
    a, b, c, lab, r, n = await _world(client)
    resp = await _post_link(client, n, r, share="lab")
    assert resp.status_code in (200, 201), resp.text
    assert (await _get(client, "ov_a", f"/api/v1/observations/{n}"))["access"] == "owner"
    assert (await _get(client, "ov_b", f"/api/v1/observations/{n}"))["access"] == "opened"
    assert (await _get(client, "ov_b", f"/api/v1/observations/{r}"))["access"] == "member"
    lst = {o["id"]: o for o in await _get(client, "ov_b", "/api/v1/observations/")}
    assert lst[r]["access"] == "member"


@pytest.mark.asyncio
async def test_hypothesis_owner_access(client):
    a, b, c, lab, r, n = await _world(client)
    h = await _mk_hyp(client)
    assert (await _get(client, "ov_a", f"/api/v1/hypotheses/{h}"))["access"] == "owner"
    lst = {o["id"]: o for o in await _get(client, "ov_a", "/api/v1/hypotheses/")}
    assert lst[h]["access"] == "owner"
