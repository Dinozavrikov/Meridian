"""Удаление Result: пока результат private (черновик), владелец удаляет; после lab/публикации нельзя (409), запись жива.
Красные на старом коде: тесты про lab и про публикацию (раньше было 204). Охранные (зелёные до патча): черновик и чужой."""
import pytest

from app.db.session import AsyncSessionLocal
from app.models.entities import Result
from tests.test_mentions_result import _mk_result
from tests.test_open_via_link import _world, _login


async def _row(rid):
    async with AsyncSessionLocal() as db:
        return await db.get(Result, rid)


@pytest.mark.asyncio
async def test_private_draft_can_be_deleted(client):
    """ОХРАННЫЙ: черновик удаляется, как раньше."""
    a, b, c, lab, r, n = await _world(client)
    rid = await _mk_result(client, lab, "черновик", vis="private")
    assert (await _row(rid)).visibility == "private"                 # контроль: черновик остался private
    d = await client.delete(f"/api/v1/results/{rid}")
    assert d.status_code == 204, d.text
    assert await _row(rid) is None


@pytest.mark.asyncio
async def test_lab_result_cannot_be_deleted(client):
    a, b, c, lab, r, n = await _world(client)
    rid = await _mk_result(client, lab, "итог", vis="lab")
    assert (await _row(rid)).visibility == "lab"                     # контроль
    d = await client.delete(f"/api/v1/results/{rid}")
    assert d.status_code == 409, d.text
    row = await _row(rid)
    assert row is not None and row.body == "итог"


@pytest.mark.asyncio
async def test_published_result_cannot_be_deleted(client):
    a, b, c, lab, r, n = await _world(client)
    rid = await _mk_result(client, lab, "итог", vis="lab")
    p = await client.post(f"/api/v1/results/{rid}/publish")
    assert p.status_code == 200, p.text                               # контроль: опубликован
    d = await client.delete(f"/api/v1/results/{rid}")
    assert d.status_code == 409, d.text
    row = await _row(rid)
    assert row is not None and row.is_published is True


@pytest.mark.asyncio
async def test_member_cannot_delete_foreign_result(client):
    """ОХРАННЫЙ: чужой результат 404 и раньше."""
    a, b, c, lab, r, n = await _world(client)
    rid = await _mk_result(client, lab, "итог", vis="lab")
    await _login(client, "ov_b")
    d = await client.delete(f"/api/v1/results/{rid}")
    assert d.status_code == 404, d.text
    assert await _row(rid) is not None


@pytest.mark.asyncio
async def test_deleting_private_draft_removes_its_mention_rows_immediately(client):
    """Красный на старом коде: слушатель не смотрел session.deleted, строки жили до сверки."""
    from tests.test_mentions_result import _rows
    from tests.test_mentions_related_matrix import _obs_text, _a
    a, b, c, lab, r, n = await _world(client)
    target = await _obs_text(client, "Цель", "x", vis="public")
    rid = await _mk_result(client, lab, _a(target), vis="private")
    assert await _rows(rid) == {("body", "observation", target)}     # контроль: строка есть
    d = await client.delete(f"/api/v1/results/{rid}")
    assert d.status_code == 204, d.text
    assert await _rows(rid) == set()
