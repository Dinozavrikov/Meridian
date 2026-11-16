"""«Вернуть» после быстрого создания = DELETE записи (в корзину). ОХРАННЫЙ (зелёный и до патча, бэкенд не меняется):
запись в корзине пропадает из связей цели, restore возвращает; допущение варианта A проверено реальным поведением."""
import pytest

from tests.conftest import create_test_user
from tests.test_lab_signal import _login
from tests.test_link_effect import _hyp, _link, _obs, _related


def _ids(related, etype):
    return set(i["id"] for i in related.get(etype, []))


@pytest.mark.asyncio
async def test_deleted_record_leaves_related_and_restore_brings_it_back(client):
    u = await create_test_user("qu_a")
    await _login(client, u.username)
    h = await _hyp(client)
    o = await _obs(client, 3)
    await _link(client, "observation", o, "hypothesis", h, "связано")
    assert o in _ids(await _related(client, "hypothesis", h), "observation")          # контроль: связь видна
    assert (await client.delete("/api/v1/observations/" + str(o))).status_code == 204
    assert o not in _ids(await _related(client, "hypothesis", h), "observation")
    assert (await client.post("/api/v1/observation/" + str(o) + "/restore")).status_code == 204
    assert o in _ids(await _related(client, "hypothesis", h), "observation")
