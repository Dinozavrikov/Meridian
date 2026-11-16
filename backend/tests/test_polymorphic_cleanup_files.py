"""GC файлов на диске (EntityImage/EntityAttachment) при hard delete родителя —
через after_commit-хук в event_log.py (see _cleanup_pending_files). Ранее было
осознанным техдолгом ("физическое удаление — отдельная GC-задача, не
реализована") — закрыто по решению Алексея 22.09."""
import os

import pytest

from app.db.session import AsyncSessionLocal
from app.models.entities import Observation, EntityImage, EntityAttachment, EntityAttachmentVersion
from sqlalchemy import select
from app.services.image_processing import IMAGES_DIR
from app.services.attachment_storage import ATTACHMENTS_DIR, save_attachment_file


def _write_image_files() -> tuple[str, str]:
    os.makedirs(IMAGES_DIR, exist_ok=True)
    full = f"test-{os.getpid()}-full.webp"
    thumb = f"test-{os.getpid()}-thumb.webp"
    with open(os.path.join(IMAGES_DIR, full), "wb") as f:
        f.write(b"fake webp bytes")
    with open(os.path.join(IMAGES_DIR, thumb), "wb") as f:
        f.write(b"fake webp thumb bytes")
    return full, thumb


@pytest.mark.asyncio
async def test_delete_observation_removes_image_files_from_disk(test_user):
    full, thumb = _write_image_files()
    full_path = os.path.join(IMAGES_DIR, full)
    thumb_path = os.path.join(IMAGES_DIR, thumb)
    assert os.path.exists(full_path) and os.path.exists(thumb_path)

    async with AsyncSessionLocal() as db:
        obs = Observation(
            user_id=test_user.id, date="2026-09-22", author="t", title="t", slug="gc-files-obs",
            text="текст", status="осмысленное", importance=0, visibility="private", lab_id=None,
        )
        db.add(obs)
        await db.commit()
        await db.refresh(obs)

        db.add(EntityImage(
            user_id=test_user.id, entity_type="observation", entity_id=obs.id,
            filename=full, thumb_filename=thumb, width=1, height=1, size_bytes=10,
        ))
        await db.commit()

        await db.delete(obs)
        await db.commit()

    assert not os.path.exists(full_path), "полноразмерный файл должен быть удалён с диска"
    assert not os.path.exists(thumb_path), "миниатюра должна быть удалена с диска"


@pytest.mark.asyncio
async def test_delete_observation_removes_attachment_file_from_disk(test_user):
    storage_path = save_attachment_file(b"print('hello')", "py")
    disk_path = os.path.join(ATTACHMENTS_DIR, storage_path)
    assert os.path.exists(disk_path)

    async with AsyncSessionLocal() as db:
        obs = Observation(
            user_id=test_user.id, date="2026-09-22", author="t", title="t", slug="gc-files-attach-obs",
            text="текст", status="осмысленное", importance=0, visibility="private", lab_id=None,
        )
        db.add(obs)
        await db.commit()
        await db.refresh(obs)

        db.add(EntityAttachment(
            user_id=test_user.id, entity_type="observation", entity_id=obs.id,
            kind="code", filename="hello.py", storage_path=storage_path,
            mime_type="text/x-python", size_bytes=15,
        ))
        await db.commit()

        await db.delete(obs)
        await db.commit()

    assert not os.path.exists(disk_path), "файл вложения должен быть удалён с диска"


@pytest.mark.asyncio
async def test_delete_observation_removes_soft_deleted_attachment_file_too(test_user):
    """Подтверждённое решение (22.09): при удалении родителя различие
    soft/hard для самого вложения больше не имеет значения — файл мягко
    удалённого (deleted_at задан) вложения тоже должен быть физически стёрт."""
    from datetime import datetime, timezone

    storage_path = save_attachment_file(b"print('soft deleted')", "py")
    disk_path = os.path.join(ATTACHMENTS_DIR, storage_path)
    assert os.path.exists(disk_path)

    async with AsyncSessionLocal() as db:
        obs = Observation(
            user_id=test_user.id, date="2026-09-22", author="t", title="t", slug="gc-files-soft-obs",
            text="текст", status="осмысленное", importance=0, visibility="private", lab_id=None,
        )
        db.add(obs)
        await db.commit()
        await db.refresh(obs)

        db.add(EntityAttachment(
            user_id=test_user.id, entity_type="observation", entity_id=obs.id,
            kind="code", filename="soft.py", storage_path=storage_path,
            mime_type="text/x-python", size_bytes=20,
            deleted_at=datetime.now(timezone.utc),
        ))
        await db.commit()

        await db.delete(obs)
        await db.commit()

    assert not os.path.exists(disk_path)


@pytest.mark.asyncio
async def test_rollback_does_not_delete_files_and_does_not_leak_into_next_commit(test_user):
    """Регресс на конкретный риск, который обсуждали: after_rollback обязан
    очищать session.info["_pending_file_cleanup"], иначе список путей,
    собранный до отката, пережил бы rollback (session.info живёт на сессию,
    не на транзакцию) и был бы ошибочно применён к следующему commit()."""
    full, thumb = _write_image_files()
    full_path = os.path.join(IMAGES_DIR, full)

    async with AsyncSessionLocal() as db:
        obs = Observation(
            user_id=test_user.id, date="2026-09-22", author="t", title="t", slug="gc-rollback-obs",
            text="текст", status="осмысленное", importance=0, visibility="private", lab_id=None,
        )
        db.add(obs)
        await db.commit()
        await db.refresh(obs)

        db.add(EntityImage(
            user_id=test_user.id, entity_type="observation", entity_id=obs.id,
            filename=full, thumb_filename=thumb, width=1, height=1, size_bytes=10,
        ))
        await db.commit()

        await db.delete(obs)
        await db.flush()  # ветка cascade-cleanup уже отработала, пути собраны в session.info
        await db.rollback()  # но коммита не было — файл должен остаться

        assert os.path.exists(full_path), "rollback не должен приводить к удалению файла"

        # Следующий, никак не связанный с картинками, commit на этой же
        # сессии не должен внезапно подхватить старый (уже неактуальный)
        # список путей и стереть файл задним числом.
        obs2 = Observation(
            user_id=test_user.id, date="2026-09-22", author="t", title="t2", slug="gc-rollback-obs2",
            text="текст2", status="осмысленное", importance=0, visibility="private", lab_id=None,
        )
        db.add(obs2)
        await db.commit()

    assert os.path.exists(full_path), "файл не должен исчезнуть после несвязанного commit"
    os.remove(full_path)
    os.remove(os.path.join(IMAGES_DIR, thumb))

@pytest.mark.asyncio
async def test_delete_observation_removes_attachment_version_files_too(test_user):
    """EntityAttachmentVersion не входит в POLYMORPHIC_CHILD_MODELS (FK на
    attachment_id, не entity_type/entity_id) — строки версий уйдут сами через
    FK ON DELETE CASCADE, когда чуть выше удалится строка EntityAttachment, но
    файлы версий на диске нужно собрать ДО этого каскада (см. event_log.py,
    добавлено при версионировании вложений 26.09) — иначе осиротеют."""
    from datetime import datetime, timezone

    current_path = save_attachment_file(b"print('current')", "py")
    version_path = save_attachment_file(b"print('old version')", "py")
    current_disk = os.path.join(ATTACHMENTS_DIR, current_path)
    version_disk = os.path.join(ATTACHMENTS_DIR, version_path)
    assert os.path.exists(current_disk) and os.path.exists(version_disk)

    async with AsyncSessionLocal() as db:
        obs = Observation(
            user_id=test_user.id, date="2026-09-26", author="t", title="t", slug="gc-files-version-obs",
            text="текст", status="осмысленное", importance=0, visibility="private", lab_id=None,
        )
        db.add(obs)
        await db.commit()
        await db.refresh(obs)

        att = EntityAttachment(
            user_id=test_user.id, entity_type="observation", entity_id=obs.id,
            kind="code", filename="current.py", storage_path=current_path,
            mime_type="text/x-python", size_bytes=17,
        )
        db.add(att)
        await db.commit()
        await db.refresh(att)

        db.add(EntityAttachmentVersion(
            attachment_id=att.id, filename="old.py", storage_path=version_path,
            mime_type="text/x-python", size_bytes=20,
            superseded_at=datetime.now(timezone.utc),
        ))
        await db.commit()
        att_id = att.id

        await db.delete(obs)
        await db.commit()

    assert not os.path.exists(current_disk), "файл текущего вложения должен быть удалён"
    assert not os.path.exists(version_disk), "файл версии должен быть удалён (не только строка через CASCADE)"

    async with AsyncSessionLocal() as db:
        remaining = (await db.execute(
            select(EntityAttachmentVersion).where(EntityAttachmentVersion.attachment_id == att_id)
        )).scalars().all()
    assert remaining == [], "строка версии должна уйти каскадом (FK ON DELETE CASCADE)"

