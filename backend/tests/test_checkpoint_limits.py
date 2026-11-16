"""Потолок хранения снимков лабы (байты, не штуки), лимит частоты, статус в ответе и изоляция транзакции
снимка (реальное поведение: чужая правка во время сборки в снимок не попадает)."""
import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.db.session import AsyncSessionLocal, engine
from app.models.entities import EntityAttachment, Observation
from app.services import lab_checkpoints as svc
from tests.test_lab_checkpoints import _dirs, _lab_kw, _mk, _snapshot, _url, _view, _world  # noqa: F401
from tests.test_undo import _login


async def _obs(w, title="before"):
    async with AsyncSessionLocal() as db:
        o = await _mk(db, Observation, w.uid["owner"], title=title, text="o", **_lab_kw(w.lab_id))
        await db.commit()
        return o.id


async def _used(lab_id):
    async with AsyncSessionLocal() as db:
        return await svc.lab_storage_bytes(db, lab_id)


@pytest.mark.asyncio
async def test_usage_is_json_plus_unique_file_bytes(client, _dirs):
    (_dirs.atts / "u1.txt").write_bytes(b"keep")
    w = await _world("owner")
    async with AsyncSessionLocal() as db:
        owner = w.uid["owner"]
        obs = await _mk(db, Observation, owner, title="o", text="o", **_lab_kw(w.lab_id))
        await _mk(db, EntityAttachment, owner, entity_type="observation", entity_id=obs.id, kind="code", filename="a.txt",
                  mime_type="text/plain", size_bytes=4, storage_path="u1.txt", language=None, text_content="keep")
        await db.commit()
    await _login(client, "owner")
    await _snapshot(client, w.lab_id)
    used_one = await _used(w.lab_id)
    await _snapshot(client, w.lab_id)
    async with AsyncSessionLocal() as db:
        sql_json = (await db.execute(text(
            "SELECT coalesce(sum(pg_column_size(i.snapshot_data)), 0) FROM lab_checkpoint_items i "
            "JOIN lab_checkpoints c ON c.id = i.checkpoint_id WHERE c.lab_id = :l"), {"l": w.lab_id})).scalar_one()
    used_two = await _used(w.lab_id)
    assert used_two == int(sql_json) + 4          # один и тот же файл в двух снимках — один раз
    assert used_two > used_one                    # а копии строк второго снимка занимают место


@pytest.mark.asyncio
async def test_over_budget_is_rejected_nothing_written_old_snapshot_intact_operator_can_raise(client, monkeypatch):
    w = await _world("owner")
    await _obs(w)
    await _login(client, "owner")
    first = await _snapshot(client, w.lab_id)
    used = await _used(w.lab_id)

    monkeypatch.setattr(svc, "LAB_BUDGET_BYTES", used + 10)
    r = await client.post(_url(w.lab_id), json={})
    assert r.status_code == 409, r.text
    d = r.json()["detail"]
    assert d["code"] == "checkpoint_budget_exceeded" and d["used_bytes"] == used
    assert d["budget_bytes"] == used + 10 and d["needed_bytes"] > 10
    assert [c["id"] for c in (await client.get(_url(w.lab_id))).json()] == [first["id"]]       # ничего не записано
    assert (await client.get(_url(w.lab_id, f"/{first['id']}"))).status_code == 200            # старое читается
    async with AsyncSessionLocal() as db:
        assert await svc.verify_checkpoint(db, first["id"]) == []

    monkeypatch.setattr(svc, "LAB_BUDGET_BYTES", used * 10)                                    # оператор поднял потолок
    assert (await client.post(_url(w.lab_id), json={})).status_code == 201


@pytest.mark.asyncio
async def test_rate_limit_counts_only_the_last_hour(client, monkeypatch):
    w = await _world("owner")
    await _login(client, "owner")
    monkeypatch.setattr(svc, "MAX_CHECKPOINTS_PER_HOUR", 2)
    await _snapshot(client, w.lab_id)
    await _snapshot(client, w.lab_id)
    r = await client.post(_url(w.lab_id), json={})
    assert r.status_code == 409 and r.json()["detail"] == {"code": "checkpoint_rate_limit", "per_hour": 2}
    async with AsyncSessionLocal() as db:
        await db.execute(text("UPDATE lab_checkpoints SET created_at = created_at - interval '2 hours' WHERE lab_id = :l"),
                         {"l": w.lab_id})
        await db.commit()
    assert (await client.post(_url(w.lab_id), json={})).status_code == 201     # старые в окно не входят


def test_storage_status_threshold(monkeypatch):
    monkeypatch.setattr(svc, "LAB_BUDGET_BYTES", 1000)
    assert svc.storage_status(10) == {"used_bytes": 10, "budget_bytes": 1000, "warn": False}
    assert svc.storage_status(799)["warn"] is False and svc.storage_status(800)["warn"] is True


@pytest.mark.asyncio
async def test_create_response_reports_real_usage_and_warns_near_budget(client, monkeypatch):
    w = await _world("owner")
    await _obs(w)
    await _login(client, "owner")
    body = await _snapshot(client, w.lab_id)
    assert body["storage"]["warn"] is False and body["storage"]["used_bytes"] == await _used(w.lab_id) > 0
    assert body["storage"]["budget_bytes"] == svc.LAB_BUDGET_BYTES

    monkeypatch.setattr(svc, "LAB_BUDGET_BYTES", 10 ** 9)
    async def nearly_full(db, lab_id):
        return 9 * 10 ** 8
    monkeypatch.setattr(svc, "lab_storage_bytes", nearly_full)
    warned = await _snapshot(client, w.lab_id)
    assert warned["storage"] == {"used_bytes": 9 * 10 ** 8, "budget_bytes": 10 ** 9, "warn": True}


def _interfere(monkeypatch, w):
    """Пока идёт сборка снимка, ДРУГАЯ сессия коммитит правку записи и новую запись."""
    original = svc.collect_items

    async def interfering(db, lab_id):
        async with AsyncSessionLocal() as other:
            await other.execute(text("UPDATE observations SET title = 'changed-mid' WHERE lab_id = :l"), {"l": lab_id})
            await _mk(other, Observation, w.uid["owner"], title="late", text="x", **_lab_kw(lab_id))
            await other.commit()
        return await original(db, lab_id)

    monkeypatch.setattr(svc, "collect_items", interfering)
    return original


def _titles(view):
    return sorted(n["data"]["title"] for n in view["entities"].get("observation", []))


@pytest.mark.asyncio
async def test_concurrent_write_during_snapshot_is_not_in_it(client, monkeypatch):
    w = await _world("owner")
    await _obs(w, "before")
    await _login(client, "owner")
    original = _interfere(monkeypatch, w)
    mid = await _snapshot(client, w.lab_id, "во время правки")
    assert _titles(await _view(client, w.lab_id, mid["id"])) == ["before"]       # снимок — из одного момента

    monkeypatch.setattr(svc, "collect_items", original)
    after = await _snapshot(client, w.lab_id, "после")
    assert _titles(await _view(client, w.lab_id, after["id"])) == ["changed-mid", "late"]   # правка была настоящей


@pytest.mark.asyncio
async def test_isolation_test_can_actually_fail_under_read_committed(client, monkeypatch):
    """Тест теста: при обычной изоляции та же чужая правка ПОПАДАЕТ в снимок — значит, проверка выше различает."""
    w = await _world("owner")
    await _obs(w, "before")
    await _login(client, "owner")
    monkeypatch.setattr(svc, "snapshot_session_maker", lambda: async_sessionmaker(engine, expire_on_commit=False))
    _interfere(monkeypatch, w)
    leaked = await _snapshot(client, w.lab_id)
    assert _titles(await _view(client, w.lab_id, leaked["id"])) == ["changed-mid", "late"]
