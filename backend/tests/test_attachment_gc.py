"""Фоновый GC мягко удалённых вложений (services/attachment_gc.py) —
физическая чистка файла с диска + удаление строки, только для вложений,
мягко удалённых более ATTACHMENT_GC_AFTER_DAYS (180) дней назад. Свежие
мягко удалённые вложения (undo-окно) джоб не трогает."""
import os
from datetime import datetime, timezone, timedelta

import pytest
from sqlalchemy import select

from app.db.session import AsyncSessionLocal
from app.models.entities import EntityAttachment, EntityAttachmentVersion
from app.services import attachment_storage as storage
from app.services.attachment_gc import run_attachment_gc, run_attachment_version_gc


@pytest.mark.asyncio
async def test_gc_removes_file_and_row_for_old_soft_deleted_attachment(test_user, monkeypatch, tmp_path):
    monkeypatch.setattr(storage, "ATTACHMENTS_DIR", str(tmp_path))
    storage_path = storage.save_attachment_file(b"old content", "py")
    disk_path = os.path.join(str(tmp_path), storage_path)
    assert os.path.exists(disk_path)

    old_deleted_at = datetime.now(timezone.utc) - timedelta(days=200)
    async with AsyncSessionLocal() as db:
        att = EntityAttachment(
            user_id=test_user.id, entity_type="observation", entity_id=999999,
            kind="code", filename="old.py", storage_path=storage_path,
            mime_type="text/x-python", size_bytes=11, deleted_at=old_deleted_at,
        )
        db.add(att)
        await db.commit()
        att_id = att.id

    await run_attachment_gc()

    assert not os.path.exists(disk_path), "файл должен быть физически удалён GC"
    async with AsyncSessionLocal() as db:
        row = await db.get(EntityAttachment, att_id)
    assert row is None, "строка должна быть удалена после GC"


@pytest.mark.asyncio
async def test_gc_leaves_recently_soft_deleted_attachment_alone(test_user, monkeypatch, tmp_path):
    """Undo-окно: мягко удалённое вчера — не трогаем, файл должен остаться."""
    monkeypatch.setattr(storage, "ATTACHMENTS_DIR", str(tmp_path))
    storage_path = storage.save_attachment_file(b"recent content", "py")
    disk_path = os.path.join(str(tmp_path), storage_path)

    recent_deleted_at = datetime.now(timezone.utc) - timedelta(days=1)
    async with AsyncSessionLocal() as db:
        att = EntityAttachment(
            user_id=test_user.id, entity_type="observation", entity_id=999998,
            kind="code", filename="recent.py", storage_path=storage_path,
            mime_type="text/x-python", size_bytes=15, deleted_at=recent_deleted_at,
        )
        db.add(att)
        await db.commit()
        att_id = att.id

    await run_attachment_gc()

    assert os.path.exists(disk_path), "файл в пределах undo-окна не должен удаляться"
    async with AsyncSessionLocal() as db:
        row = await db.get(EntityAttachment, att_id)
    assert row is not None, "строка в пределах undo-окна должна остаться"
    os.remove(disk_path)


@pytest.mark.asyncio
async def test_gc_leaves_non_deleted_attachment_alone(test_user, monkeypatch, tmp_path):
    """Живое (не удалённое) вложение GC не трогает вообще."""
    monkeypatch.setattr(storage, "ATTACHMENTS_DIR", str(tmp_path))
    storage_path = storage.save_attachment_file(b"alive content", "py")
    disk_path = os.path.join(str(tmp_path), storage_path)

    async with AsyncSessionLocal() as db:
        att = EntityAttachment(
            user_id=test_user.id, entity_type="observation", entity_id=999997,
            kind="code", filename="alive.py", storage_path=storage_path,
            mime_type="text/x-python", size_bytes=13, deleted_at=None,
        )
        db.add(att)
        await db.commit()
        att_id = att.id

    await run_attachment_gc()

    assert os.path.exists(disk_path)
    async with AsyncSessionLocal() as db:
        row = await db.get(EntityAttachment, att_id)
    assert row is not None
    os.remove(disk_path)


@pytest.mark.asyncio
async def test_gc_emits_deleted_event_for_gced_attachment(test_user, monkeypatch, tmp_path):
    """Физическое удаление строки через db.delete (не bulk DELETE) — должно
    пройти через обычный before_flush-listener и оставить Event(deleted),
    как любое другое удаление attachment-сущности."""
    from app.models.entities import Event

    monkeypatch.setattr(storage, "ATTACHMENTS_DIR", str(tmp_path))
    storage_path = storage.save_attachment_file(b"tracked content", "py")

    old_deleted_at = datetime.now(timezone.utc) - timedelta(days=200)
    async with AsyncSessionLocal() as db:
        att = EntityAttachment(
            user_id=test_user.id, entity_type="observation", entity_id=999996,
            kind="code", filename="tracked.py", storage_path=storage_path,
            mime_type="text/x-python", size_bytes=16, deleted_at=old_deleted_at,
        )
        db.add(att)
        await db.commit()
        att_id = att.id

    await run_attachment_gc()

    async with AsyncSessionLocal() as db:
        events = (await db.execute(
            select(Event).where(Event.type == "deleted", Event.entity_type == "attachment", Event.entity_id == att_id)
        )).scalars().all()
    assert len(events) == 1

# --- сироты версий (добавлено при версионировании вложений, 26.09) ---

@pytest.mark.asyncio
async def test_gc_removes_version_files_when_hard_deleting_attachment(test_user, monkeypatch, tmp_path):
    """Хард-delete attachment'а должен убрать не только его собственный файл,
    но и файлы ВСЕХ его версий — строки версий уйдут сами через FK ON DELETE
    CASCADE, файлы — нет, если не почистить явно (см. _remove_version_files)."""
    monkeypatch.setattr(storage, "ATTACHMENTS_DIR", str(tmp_path))
    current_path = storage.save_attachment_file(b"current", "py")
    version_path = storage.save_attachment_file(b"old version", "py")
    current_disk = os.path.join(str(tmp_path), current_path)
    version_disk = os.path.join(str(tmp_path), version_path)

    old_deleted_at = datetime.now(timezone.utc) - timedelta(days=200)
    async with AsyncSessionLocal() as db:
        att = EntityAttachment(
            user_id=test_user.id, entity_type="observation", entity_id=999995,
            kind="code", filename="current.py", storage_path=current_path,
            mime_type="text/x-python", size_bytes=7, deleted_at=old_deleted_at,
        )
        db.add(att)
        await db.commit()
        att_id = att.id

        db.add(EntityAttachmentVersion(
            attachment_id=att_id, filename="old.py", storage_path=version_path,
            mime_type="text/x-python", size_bytes=12,
            # версия свежая (5 дней) — сама по себе run_attachment_version_gc её
            # бы не тронула, но хард-delete attachment'а должен унести её файл всё равно
            superseded_at=datetime.now(timezone.utc) - timedelta(days=5),
        ))
        await db.commit()

    await run_attachment_gc()

    assert not os.path.exists(current_disk)
    assert not os.path.exists(version_disk), "файл версии должен уйти вместе с attachment'ом, даже если сама версия свежая"
    async with AsyncSessionLocal() as db:
        assert await db.get(EntityAttachment, att_id) is None
        remaining = (await db.execute(
            select(EntityAttachmentVersion).where(EntityAttachmentVersion.attachment_id == att_id)
        )).scalars().all()
    assert remaining == []


@pytest.mark.asyncio
async def test_version_gc_removes_expired_version_file_and_row(test_user, monkeypatch, tmp_path):
    """Независимый retention версий (п.5 задачи): просроченная версия чистится,
    даже если родительское вложение живо и никуда не денется."""
    monkeypatch.setattr(storage, "ATTACHMENTS_DIR", str(tmp_path))
    current_path = storage.save_attachment_file(b"alive current", "py")
    version_path = storage.save_attachment_file(b"expired version", "py")
    current_disk = os.path.join(str(tmp_path), current_path)
    version_disk = os.path.join(str(tmp_path), version_path)

    async with AsyncSessionLocal() as db:
        att = EntityAttachment(
            user_id=test_user.id, entity_type="observation", entity_id=999994,
            kind="code", filename="alive.py", storage_path=current_path,
            mime_type="text/x-python", size_bytes=14,
        )
        db.add(att)
        await db.commit()
        att_id = att.id

        old_version = EntityAttachmentVersion(
            attachment_id=att_id, filename="old.py", storage_path=version_path,
            mime_type="text/x-python", size_bytes=16,
            superseded_at=datetime.now(timezone.utc) - timedelta(days=200),
        )
        db.add(old_version)
        await db.commit()
        version_id = old_version.id

    await run_attachment_version_gc()

    assert not os.path.exists(version_disk), "файл просроченной версии должен быть удалён"
    assert os.path.exists(current_disk), "живое вложение (не версия) джоба версий не трогает"
    async with AsyncSessionLocal() as db:
        assert await db.get(EntityAttachmentVersion, version_id) is None
        assert await db.get(EntityAttachment, att_id) is not None
    os.remove(current_disk)


@pytest.mark.asyncio
async def test_version_gc_leaves_recent_versions_alone(test_user, monkeypatch, tmp_path):
    """Undo-окно для версий: свежая версия (в пределах ATTACHMENT_GC_AFTER_DAYS
    от superseded_at) не трогается."""
    monkeypatch.setattr(storage, "ATTACHMENTS_DIR", str(tmp_path))
    current_path = storage.save_attachment_file(b"alive current 2", "py")
    version_path = storage.save_attachment_file(b"recent version", "py")
    current_disk = os.path.join(str(tmp_path), current_path)
    version_disk = os.path.join(str(tmp_path), version_path)

    async with AsyncSessionLocal() as db:
        att = EntityAttachment(
            user_id=test_user.id, entity_type="observation", entity_id=999993,
            kind="code", filename="alive2.py", storage_path=current_path,
            mime_type="text/x-python", size_bytes=16,
        )
        db.add(att)
        await db.commit()
        att_id = att.id

        recent_version = EntityAttachmentVersion(
            attachment_id=att_id, filename="old2.py", storage_path=version_path,
            mime_type="text/x-python", size_bytes=15,
            superseded_at=datetime.now(timezone.utc) - timedelta(days=1),
        )
        db.add(recent_version)
        await db.commit()
        version_id = recent_version.id

    await run_attachment_version_gc()

    assert os.path.exists(version_disk), "версия в пределах retention-окна не должна удаляться"
    async with AsyncSessionLocal() as db:
        assert await db.get(EntityAttachmentVersion, version_id) is not None
    os.remove(current_disk)
    os.remove(version_disk)

