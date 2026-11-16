"""Выбор «кому видно» на остальных путях: создание и правка прогноза, привязка гипотезы к задаче, повторная связь.
Закрытие пробелов покрытия. Самые рискованные места: share=public на новом прогнозе (у него ещё нет id)
и на PUT с явным visibility=private (поле не должно вернуть публикацию назад)."""
import pytest

from app.models.entities import RecordShare
from tests.test_open_via_link import _login, _world, create_test_user
from tests.test_open_via_link_sources import _mk_hyp, _mk_task
from tests.test_publication_share import _count, _post_link
from tests.test_publication_share_public import _mk_public_lab


def _pred_body(hyp=None):
    b = {"title": "P", "text": "t", "date_created": "2026-08-06", "expected_check_date": "2026-12-01T00:00:00", "visibility": "private"}
    if hyp:
        b["hypothesis_id"] = hyp
    return b


async def _pub(client):
    """Публичная лаборатория pp-lab с публичной гипотезой; автор pp_a (залогинен), посторонний pp_s."""
    await create_test_user("pp_a"); await create_test_user("pp_s")
    await _login(client, "pp_a")
    lab = await _mk_public_lab(client, "pp-lab")
    return lab, await _mk_hyp(client, lab)


async def _status(client, username, url):
    await _login(client, username)
    return (await client.get(url)).status_code


@pytest.mark.asyncio
@pytest.mark.parametrize("share,code", [(None, 409), ("me", 201), ("lab", 201), ("public", 400)])
async def test_pred_create_in_closed_lab(client, share, code):
    a, b, c, lab, r, n = await _world(client)
    h = await _mk_hyp(client, lab)
    resp = await client.post("/api/v1/predictions/", params={"share": share} if share else {}, json=_pred_body(h))
    assert resp.status_code in ((200, 201) if code == 201 else (code,)), resp.text
    if code == 409:
        assert resp.json()["detail"]["impacts"][0]["options"] == ["me", "lab"]
    assert await _count(RecordShare) == (1 if share == "lab" else 0)
    if code == 201:
        pid = resp.json()["id"]
        assert (await _status(client, "ov_b", f"/api/v1/predictions/{pid}") == 200) == (share == "lab")


@pytest.mark.asyncio
@pytest.mark.parametrize("share,visible", [("me", False), ("public", True)])
async def test_pred_create_in_public_lab(client, share, visible):
    lab, h = await _pub(client)
    resp = await client.post("/api/v1/predictions/", params={"share": share}, json=_pred_body(h))
    assert resp.status_code in (200, 201), resp.text
    pid = resp.json()["id"]
    assert await _count(RecordShare) == 0
    assert (await _status(client, "pp_s", f"/api/v1/predictions/{pid}") == 200) == visible


@pytest.mark.asyncio
@pytest.mark.parametrize("share,visible", [("me", False), ("public", True)])
async def test_pred_update_in_public_lab_keeps_choice_despite_explicit_private(client, share, visible):
    lab, h = await _pub(client)
    resp = await client.post("/api/v1/predictions/", json=_pred_body())
    assert resp.status_code in (200, 201), resp.text
    pid = resp.json()["id"]
    upd = await client.put(f"/api/v1/predictions/{pid}", params={"share": share}, json={**_pred_body(), "hypothesis_id": h})
    assert upd.status_code == 200, upd.text
    assert (await _status(client, "pp_s", f"/api/v1/predictions/{pid}") == 200) == visible


@pytest.mark.asyncio
async def test_task_binding_in_closed_lab_share_lab(client):
    a, b, c, lab, r, n = await _world(client)
    h = await _mk_hyp(client, lab); t = await _mk_task(client)
    resp = await client.post(f"/api/v1/tasks/{t}/hypotheses/{h}", params={"share": "lab"})
    assert resp.status_code == 204, resp.text
    assert await _count(RecordShare) == 1
    assert await _status(client, "ov_b", f"/api/v1/tasks/{t}") == 200


@pytest.mark.asyncio
@pytest.mark.parametrize("share,visible", [("me", False), ("public", True)])
async def test_task_binding_in_public_lab(client, share, visible):
    lab, h = await _pub(client)
    t = await _mk_task(client)
    resp = await client.post(f"/api/v1/tasks/{t}/hypotheses/{h}", params={"share": share})
    assert resp.status_code == 204, resp.text
    assert (await _status(client, "pp_s", f"/api/v1/tasks/{t}") == 200) == visible


@pytest.mark.asyncio
async def test_repeat_link_with_wider_share_still_opens(client):
    """Сначала «только мне», потом «участникам» на ту же пару: IntegrityError откатывает транзакцию вместе со строкой согласия."""
    a, b, c, lab, r, n = await _world(client)
    assert (await _post_link(client, n, r, share="me")).status_code == 200
    assert (await _post_link(client, n, r, share="lab")).status_code == 200
    assert await _count(RecordShare) == 1
    assert await _status(client, "ov_b", f"/api/v1/observations/{n}") == 200


@pytest.mark.asyncio
async def test_repeat_link_same_share_does_not_duplicate_consent(client):
    """ОХРАННЫЙ: повторное «участникам» не плодит строки согласия."""
    a, b, c, lab, r, n = await _world(client)
    assert (await _post_link(client, n, r, share="lab")).status_code == 200
    assert (await _post_link(client, n, r, share="lab")).status_code == 200
    assert await _count(RecordShare) == 1
