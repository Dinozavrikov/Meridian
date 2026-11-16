"""PUT прогноза: пропущенное поле остаётся как есть, а не сбрасывается к умолчанию схемы
(регрессия: DetailPanel.updateScale слал PUT без confidence/visibility/lab_id/
confirms_hypothesis_if_true, и каждое сохранение молча обнуляло их)."""
import pytest

from app.db.session import AsyncSessionLocal
from app.models.entities import Prediction
from tests.conftest import create_test_user
from tests.test_undo import _login, _new_pred, _put_pred

_REQUIRED = {"text": "will happen", "date_created": "2026-09-28", "expected_check_date": "2026-12-01T00:00:00Z"}


async def _db_pred(pid):
    async with AsyncSessionLocal() as s:
        return await s.get(Prediction, pid)


def _partial(client, pid, **fields):
    return client.put(f"/api/v1/predictions/{pid}", json={**_REQUIRED, **fields})


@pytest.mark.asyncio
async def test_omitted_fields_are_preserved_and_explicit_null_clears(client):
    await create_test_user("put_u1")
    await _login(client, "put_u1")
    pred = await _new_pred(client)
    r = await _put_pred(client, pred["id"], confidence=70, visibility="public", confirms_hypothesis_if_true=False)
    assert r.status_code == 200, r.text

    # клиент шлёт только то, что меняет — остальное не трогаем
    r = await _partial(client, pred["id"], title="renamed")
    assert r.status_code == 200, r.text
    p = await _db_pred(pred["id"])
    assert (p.title, p.confidence, p.visibility, p.confirms_hypothesis_if_true, p.status) == \
        ("renamed", 70, "public", False, "не проверен")

    # явный null — осознанная очистка, а не «поле пропущено»
    assert (await _partial(client, pred["id"], confidence=None)).status_code == 200
    assert (await _db_pred(pred["id"])).confidence is None


@pytest.mark.asyncio
async def test_partial_put_keeps_closed_status_and_confidence(client):
    await create_test_user("put_u2")
    await _login(client, "put_u2")
    pred = await _new_pred(client)  # confidence 60 из _PRED
    r = await client.put(f"/api/v1/predictions/{pred['id']}/close",
                         json={"status": "подтвердился", "result_notes": ""})
    assert r.status_code == 200, r.text

    r = await _partial(client, pred["id"], result_notes="заметка")
    assert r.status_code == 200, r.text
    p = await _db_pred(pred["id"])
    assert (p.status, p.confidence, p.result_notes) == ("подтвердился", 60, "заметка")
