"""Матрица видимости упоминаний в GET /graph/related: лаборатория, открыта через связь, источник и цель, без входа.
ОХРАННЫЕ (зелёные и до патча): поведение уже реализовано, красными становятся только мутацией graph.py.
Контроль в каждой клетке: тот, кому запись положено видеть, её видит (иначе «не видит» ничего не доказывает)."""
import pytest

from tests.test_mentions_related import _related, _ends
from tests.test_open_via_link import _world, _login, _mk_obs, _link

SEC_LAB, SEC_PRIV, SEC_SRC = "СЕКРЕТ-ЛАБ", "СЕКРЕТ-ПРИВ", "СЕКРЕТ-ИСТОЧНИК"


async def _obs_text(client, title, text, lab=None, vis="private"):
    r = await client.post("/api/v1/observations/", json={"title": title, "date": "2026-09-23", "author": "a", "text": text,
                                                         "lab_id": lab, "visibility": vis, "tags": []})
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _a(oid):
    return f'<a href="meridian://observation/{oid}">x</a>'


async def _setup(client):
    """Источник публичный, в тексте ссылки на лабораторную и на приватную запись владельца. После вызова клиент вошёл как ov_a."""
    a, b, c, lab, r, n = await _world(client)
    lab_end = await _mk_obs(client, SEC_LAB, lab, "lab")
    priv_end = await _mk_obs(client, SEC_PRIV)
    src = await _obs_text(client, "Источник", _a(lab_end) + _a(priv_end), vis="public")
    return lab, lab_end, priv_end, src


@pytest.mark.asyncio
async def test_owner_sees_both_ends(client):
    """Контроль: упоминания в этом мире действительно записаны."""
    lab, lab_end, priv_end, src = await _setup(client)
    r = await _related(client, "observation", src)
    assert r.status_code == 200, r.text
    assert _ends(r, "mentions") == {("observation", lab_end), ("observation", priv_end)}


@pytest.mark.asyncio
async def test_member_sees_lab_end_but_not_private_end(client):
    lab, lab_end, priv_end, src = await _setup(client)
    await _login(client, "ov_b")
    r = await _related(client, "observation", src)
    assert r.status_code == 200, r.text
    assert _ends(r, "mentions") == {("observation", lab_end)}
    assert SEC_PRIV not in r.text


@pytest.mark.asyncio
async def test_outsider_sees_neither_lab_nor_private_end(client):
    lab, lab_end, priv_end, src = await _setup(client)
    await _login(client, "ov_s")
    r = await _related(client, "observation", src)
    assert r.status_code == 200, r.text
    assert _ends(r, "mentions") == set()
    assert SEC_LAB not in r.text and SEC_PRIV not in r.text


@pytest.mark.asyncio
async def test_private_source_not_leaked_through_mentioned_in(client):
    a, b, c, lab, r, n = await _world(client)
    target = await _obs_text(client, "Цель", "x", vis="public")
    src = await _obs_text(client, SEC_SRC, _a(target))
    own = await _related(client, "observation", target)
    assert _ends(own, "mentioned_in") == {("observation", src)}       # контроль
    await _login(client, "ov_s")
    rel = await _related(client, "observation", target)
    assert rel.status_code == 200, rel.text
    assert _ends(rel, "mentioned_in") == set()
    assert SEC_SRC not in rel.text


@pytest.mark.asyncio
async def test_lab_source_visible_to_member_not_to_outsider(client):
    a, b, c, lab, r, n = await _world(client)
    target = await _obs_text(client, "Цель", "x", vis="public")
    src = await _obs_text(client, SEC_SRC, _a(target), lab, "lab")
    await _login(client, "ov_b")
    member = await _related(client, "observation", target)
    assert _ends(member, "mentioned_in") == {("observation", src)}    # контроль
    await _login(client, "ov_s")
    out = await _related(client, "observation", target)
    assert _ends(out, "mentioned_in") == set()
    assert SEC_SRC not in out.text


@pytest.mark.asyncio
async def test_end_opened_via_link_visible_to_member_not_to_outsider(client):
    """N приватная, открыта лаборатории связью с R, которую создал её владелец. Упоминание N из публичной записи.
    Ожидание выведено из правила «открыта через связь», а не из чтения _visible: красный тест здесь = находка или моя ошибка."""
    a, b, c, lab, r, n = await _world(client)
    await _link(a.id, n, r)
    src = await _obs_text(client, "Источник", _a(n), vis="public")
    await _login(client, "ov_b")
    member = await _related(client, "observation", src)
    assert _ends(member, "mentions") == {("observation", n)}
    await _login(client, "ov_s")
    out = await _related(client, "observation", src)
    assert _ends(out, "mentions") == set()


@pytest.mark.asyncio
async def test_no_login_sees_nothing_private(client):
    """Без входа (куки очищены): граф записи открыт и гостю (только публичное), но лабораторное и приватное не видно
    ни в связях, ни в упоминаниях. Раньше без входа был отказ (401): гость получил граф с вариантом А."""
    lab, lab_end, priv_end, src = await _setup(client)
    client.cookies.clear()
    r = await _related(client, "observation", src)
    assert r.status_code in (200, 403, 404), r.status_code   # 200 — публичная запись; закрытая корнем отвечает 403/404
    assert SEC_LAB not in r.text and SEC_PRIV not in r.text


@pytest.mark.asyncio
async def test_one_record_in_two_fields_is_one_row_with_both_fields(client):
    """Вопрос ссылается на одну запись и в text, и в answer: одна строка, fields из двух значений."""
    a, b, c, lab, r, n = await _world(client)
    target = await _obs_text(client, "Цель", "x", vis="public")
    q = await client.post("/api/v1/questions/", json={"title": "В", "text": _a(target), "answer": _a(target),
                                                      "date_created": "2026-09-28", "visibility": "public"})
    assert q.status_code == 201, q.text
    rel = await _related(client, "question", q.json()["id"])
    assert rel.status_code == 200, rel.text
    rows = [i for i in rel.json()["mentions"]["mentions"] if i["id"] == target]
    assert len(rows) == 1, rows
    assert sorted(rows[0]["fields"]) == ["answer", "text"], rows[0]
