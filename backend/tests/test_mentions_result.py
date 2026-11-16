"""Result как источник упоминаний (поле body) и принятие правки через ORM.
ОХРАННЫЕ (зелёные и до патча): поведение уже реализовано, красными становятся только мутацией mention_sync.py.
Строки читаются прямо из entity_mentions: Result нет в RELATED_MODEL_MAP, через get_related его не увидеть."""
import pytest
from sqlalchemy import select

from app.db.session import AsyncSessionLocal
from app.models.entities import EntityMention
from tests.test_mentions_related import _related, _ends
from tests.test_mentions_related_matrix import _obs_text, _a
from tests.test_open_via_link import _world, _login

SEC = "СЕКРЕТ-РЕЗУЛЬТАТ"


async def _rows(rid):
    async with AsyncSessionLocal() as db:
        rs = (await db.execute(select(EntityMention).where(
            EntityMention.source_type == "result", EntityMention.source_id == rid))).scalars().all()
    return {(m.field, m.target_type, m.target_id) for m in rs}


async def _mk_result(client, lab, body, title="Рез", vis="private"):
    r = await client.post("/api/v1/results/", json={"title": title, "body": body, "lab_id": lab, "visibility": vis})
    assert r.status_code == 201, r.text
    return r.json()["id"]


@pytest.mark.asyncio
async def test_result_body_link_is_recorded(client):
    a, b, c, lab, r, n = await _world(client)
    target = await _obs_text(client, "Цель", "x", vis="public")
    rid = await _mk_result(client, lab, _a(target))
    assert await _rows(rid) == {("body", "observation", target)}


@pytest.mark.asyncio
async def test_suggestion_pending_is_not_extracted_accept_is(client):
    a, b, c, lab, r, n = await _world(client)
    target = await _obs_text(client, "Цель", "x", vis="public")
    rid = await _mk_result(client, lab, "без ссылок", vis="lab")
    assert await _rows(rid) == set()                                    # контроль: исходно пусто
    await _login(client, "ov_b")
    s = await client.post(f"/api/v1/results/{rid}/suggestions", json={"proposed_body": _a(target)})
    assert s.status_code == 201, s.text
    assert await _rows(rid) == set()                                    # pending не извлекается
    await _login(client, "ov_a")
    acc = await client.post(f"/api/v1/results/{rid}/suggestions/{s.json()['id']}/accept")
    assert acc.status_code == 200, acc.text
    assert await _rows(rid) == {("body", "observation", target)}        # принятая правка через ORM увидена слушателем


@pytest.mark.asyncio
async def test_removing_link_from_body_removes_row(client):
    a, b, c, lab, r, n = await _world(client)
    target = await _obs_text(client, "Цель", "x", vis="public")
    rid = await _mk_result(client, lab, _a(target))
    assert await _rows(rid)                                             # контроль
    u = await client.put(f"/api/v1/results/{rid}", json={"title": "Рез", "body": "пусто", "visibility": "private"})
    assert u.status_code == 200, u.text
    assert await _rows(rid) == set()


@pytest.mark.asyncio
async def test_result_source_not_shown_in_mentioned_in(client):
    """Фиксирует решение «Result в упоминаниях не показывается» (нет в RELATED_MODEL_MAP), не доказывает его правильность."""
    a, b, c, lab, r, n = await _world(client)
    target = await _obs_text(client, "Цель", "x", vis="public")
    rid = await _mk_result(client, lab, _a(target), title=SEC, vis="lab")
    assert await _rows(rid)                                             # контроль: строка в БД есть
    for who in ("ov_a", "ov_b", "ov_s"):
        await _login(client, who)
        rel = await _related(client, "observation", target)
        assert rel.status_code == 200, rel.text
        assert not any(t == "result" for t, _ in _ends(rel, "mentioned_in")), who
        assert SEC not in rel.text, who
