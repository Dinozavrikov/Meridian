"""POST /graph/links: link_type длиннее колонки (64) отклоняется сразу, а не падает в БД."""
import pytest

from tests.test_link_same_type import _link, _two_hyps, _unlink
from tests.test_open_via_link import _world


@pytest.mark.asyncio
async def test_link_type_longer_than_column_is_rejected(client):
    await _world(client)
    h1, h2 = await _two_hyps(client)
    a, b = ("hypothesis", h1), ("hypothesis", h2)
    try:
        r = await _link(client, a, b, "x" * 65)
    except Exception as e:                       # старый код: ошибка БД уходит исключением (в проде это 500)
        pytest.fail(f"запрос упал необработанным исключением {type(e).__name__}")
    assert r.status_code == 422, r.text          # КРАСНЫЙ на старом коде
    assert await _unlink(client, a, b) == 0


@pytest.mark.asyncio
async def test_link_type_of_exactly_column_length_is_rejected_by_vocabulary(client):
    """Граница длины (64) проходит проверку размера, но строка вне словаря пары отклоняется: 400, а не запись в БД."""
    await _world(client)
    h1, h2 = await _two_hyps(client)
    a, b = ("hypothesis", h1), ("hypothesis", h2)
    assert (await _link(client, a, b, "x" * 64)).status_code == 400
    assert await _unlink(client, a, b) == 0
