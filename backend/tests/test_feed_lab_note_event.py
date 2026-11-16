"""Заметка к лабораторному наблюдению пишет событие с visibility=public: в публичной ленте гостя не должно быть ни наблюдения, ни текста заметки."""
import pytest

from tests.conftest import create_test_user
from tests.test_feed_groups_api import PUB, _create_lab, _login, _note, _rec


@pytest.mark.asyncio
async def test_guest_public_feed_has_no_trace_of_lab_observation_note(client):
    u = await create_test_user("ln_a1")
    await _login(client, "ln_a1")
    lab = await _create_lab(client, "Lab LN1", True)
    oid = await _rec("observation", u.id, visibility="lab", lab_id=lab["id"], title="LAB-OBS-LN-ZZ")
    await _note(client, oid, "LAB-NOTE-LN-ZZ")
    client.cookies.clear()
    r = await client.get(PUB)
    assert r.status_code == 200, r.text
    assert "LAB-OBS-LN-ZZ" not in r.text and "LAB-NOTE-LN-ZZ" not in r.text
    cores = [g["core"]["entity_id"] for g in r.json()["groups"] if g["core"]["type"] == "observation"]
    assert oid not in cores
