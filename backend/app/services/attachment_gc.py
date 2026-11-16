"""Отложенная физическая чистка вложений (EntityAttachment) и их версий
(EntityAttachmentVersion).

Две независимые джобы:
- run_attachment_gc — удаление вложения (attachments.py::delete_attachment)
  только помечает deleted_at, файл на диске нужен для undo. Этот джоб —
  вторая половина цикла: раз в сутки находит записи, мягко удалённые больше
  ATTACHMENT_GC_AFTER_DAYS дней назад, физически стирает файл с диска (и
  файлы ВСЕХ версий этого вложения — см. _remove_version_files, иначе они
  осиротеют: строки EntityAttachmentVersion уйдут сами через FK ON DELETE
  CASCADE, а их файлы — нет), затем удаляет саму строку EntityAttachment
  (через ORM db.delete, не bulk DELETE — EntityAttachment входит в
  EVENT_LOGGED_MODELS, это гарантирует обычную запись Event(type="deleted")
  тем же путём, что и любое другое удаление сущности, не пропускает
  событийный лог).
- run_attachment_version_gc — независимый retention для самих версий, пока
  родительское вложение живо (attachments.py::replace_attachment_file/
  replace_attachment_text/restore_attachment_version создают их): раз в
  сутки удаляет строки EntityAttachmentVersion старше ATTACHMENT_GC_AFTER_DAYS
  дней от superseded_at и физически стирает их файлы. EntityAttachmentVersion
  не входит в EVENT_LOGGED_MODELS — это технический артефакт версионирования,
  не пользовательское действие само по себе (см. докстринг attachments.py),
  поэтому явный Event здесь не пишется, db.delete используется просто как
  ORM-обёртка над DELETE, без сайд-эффектов event_log.py.

180 дней — сознательно большое окно (решение Алексея, 23.09): Meridian —
платформа для исследований, не соцсеть с мгновенным контентом, короткое
окно на восстановление было бы неуместно. То же окно переиспользуется для
версий (решение Алексея, 26.09) — отдельного, более короткого retention для
версий не вводили.
"""
import os
from datetime import datetime, timezone, timedelta
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import AsyncSessionLocal
from app.models.entities import EntityAttachment, EntityAttachmentVersion
from app.services import attachment_storage as storage

ATTACHMENT_GC_AFTER_DAYS = 180
BATCH_LIMIT = 200  # не держим транзакцию открытой на неограниченном наборе строк


async def _remove_version_files(db: AsyncSession, attachment_id: int) -> None:
    """Физически удаляет файлы ВСЕХ версий вложения (best-effort). Строки
    EntityAttachmentVersion не трогает — вызывающий код сам решает их судьбу
    (каскадно уйдут вместе с attachment через FK, либо удаляются явно, как
    в run_attachment_version_gc)."""
    paths = (await db.execute(
        select(EntityAttachmentVersion.storage_path).where(
            EntityAttachmentVersion.attachment_id == attachment_id
        )
    )).scalars().all()
    for storage_path in paths:
        try:
            path = storage.resolve_attachment_path(storage_path)
        except ValueError:
            continue
        try:
            os.remove(path)
        except OSError:
            pass  # файла уже нет или недоступен — не блокируем чистку из-за этого


async def run_attachment_gc():
    """Вызывается по расписанию (см. main.py, тот же паттерн, что
    run_delayed_recheck/send_due_prediction_reminders)."""
    from app.core.entity_registry import get_system_user_id

    cutoff = datetime.now(timezone.utc) - timedelta(days=ATTACHMENT_GC_AFTER_DAYS)

    async with AsyncSessionLocal() as db:
        db.sync_session.info["actor_id"] = await get_system_user_id(db)

        rows = (await db.execute(
            select(EntityAttachment)
            .where(EntityAttachment.deleted_at.is_not(None), EntityAttachment.deleted_at <= cutoff)
            .limit(BATCH_LIMIT)
        )).scalars().all()

        for att in rows:
            try:
                path = storage.resolve_attachment_path(att.storage_path)
            except ValueError:
                path = None
            if path:
                try:
                    os.remove(path)
                except OSError:
                    pass  # файла уже нет или недоступен — не блокируем чистку строки из-за этого
            await _remove_version_files(db, att.id)  # иначе осиротеют — строки уйдут каскадом, файлы нет
            await db.delete(att)

        if rows:
            await db.commit()


async def run_attachment_version_gc():
    """Независимый от run_attachment_gc retention для версий (п.5 исходной
    задачи): версии старше ATTACHMENT_GC_AFTER_DAYS дней от superseded_at
    удаляются, даже если родительское вложение живо и никуда не денется."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=ATTACHMENT_GC_AFTER_DAYS)

    async with AsyncSessionLocal() as db:
        rows = (await db.execute(
            select(EntityAttachmentVersion)
            .where(EntityAttachmentVersion.superseded_at <= cutoff)
            .limit(BATCH_LIMIT)
        )).scalars().all()

        for v in rows:
            try:
                path = storage.resolve_attachment_path(v.storage_path)
            except ValueError:
                path = None
            if path:
                try:
                    os.remove(path)
                except OSError:
                    pass
            await db.delete(v)

        if rows:
            await db.commit()
