"""Хеш родителя хранится в самом снимке: снимок остаётся проверяемым, когда родитель из другой лабы
исчез (parent_id -> NULL), а подмена хеша живого родителя по-прежнему видна."""
from datetime import datetime, timezone

import pytest
from sqlalchemy import text

from app.db.session import AsyncSessionLocal
from app.models.checkpoints import LabCheckpoint
from app.services import lab_checkpoints as svc
from app.services.checkpoint_hash import SCHEMA_VERSION, commit_hash, tree_hash
from tests.test_lab_checkpoints import _dirs, _lab, _snapshot, _world  # noqa: F401  (_dirs — autouse-фикстура)
from tests.test_undo import _login


async def _fork_child(parent_cp_id: int, other_lab_id: int) -> int:
    """Снимок ДРУГОЙ лабы с родителем из этой — как будет у fork. Хеши — по документированному алгоритму."""
    async with AsyncSessionLocal() as db:
        parent = await db.get(LabCheckpoint, parent_cp_id)
        now, tree = datetime.now(timezone.utc), tree_hash([])
        child = LabCheckpoint(
            lab_id=other_lab_id, parent_id=parent.id, parent_commit_hash=parent.commit_hash, schema_version=SCHEMA_VERSION,
            tree_hash=tree, item_count=0, blob_bytes=0, created_at=now, title=None,
            commit_hash=commit_hash(lab_id=other_lab_id, parent_commit_hash=parent.commit_hash, tree=tree,
                                    created_at=now, title=None))
        db.add(child)
        await db.commit()
        return child.id


async def _problems(cid: int) -> list[str]:
    async with AsyncSessionLocal() as db:       # свежая сессия на каждую проверку: без устаревших объектов
        return await svc.verify_checkpoint(db, cid)


@pytest.mark.asyncio
async def test_snapshot_stays_verifiable_after_its_cross_lab_parent_is_gone(client):
    w = await _world("owner")
    async with AsyncSessionLocal() as db:
        other = await _lab(db, w.uid["owner"])
        await db.commit()
        other_id = other.id
    await _login(client, "owner")
    parent = await _snapshot(client, w.lab_id, "родитель")
    child_id = await _fork_child(parent["id"], other_id)
    assert await _problems(child_id) == []

    r = await client.delete(f"/api/v1/labs/{w.lab_id}")          # исходная лаба исчезла вместе со своими снимками
    assert r.status_code < 300, r.text
    async with AsyncSessionLocal() as db:
        child = await db.get(LabCheckpoint, child_id)
        assert child.parent_id is None                                   # ссылка пропала (SET NULL)...
        assert child.parent_commit_hash == parent["commit_hash"]         # ...а хеш родителя остался в снимке
    assert await _problems(child_id) == []                               # раньше здесь было ["commit"]


@pytest.mark.asyncio
async def test_new_snapshot_records_parent_hash_and_rewriting_it_is_detected(client):
    w = await _world("owner")
    await _login(client, "owner")
    c1, c2 = await _snapshot(client, w.lab_id, "первый"), await _snapshot(client, w.lab_id, "второй")
    async with AsyncSessionLocal() as db:
        first, second = await db.get(LabCheckpoint, c1["id"]), await db.get(LabCheckpoint, c2["id"])
        assert first.parent_commit_hash is None and second.parent_commit_hash == first.commit_hash
    assert await _problems(c2["id"]) == []

    async with AsyncSessionLocal() as db:                                # правка хеша живого родителя
        await db.execute(text("UPDATE lab_checkpoints SET commit_hash = :h WHERE id = :i"), {"h": "f" * 64, "i": c1["id"]})
        await db.commit()
    assert "parent" in await _problems(c2["id"])
    assert "commit" in await _problems(c1["id"])
