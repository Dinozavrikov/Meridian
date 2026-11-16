"""Файловые вложения (код/документы/прочее) к 6 базовым сущностям — EntityAttachment.

Права:
- загрузка — только владелец сущности (require_owned_entity), как у картинок;
- чтение/скачивание — get_entity_for_view (владелец, участник лабы, гость для
  public), недоступное скрываем как 404 — не подтверждаем факт существования;
- удаление — только автор вложения, мягкое (deleted_at); файл с диска здесь НЕ
  удаляется сразу (задел под возможный будущий undo самого удаления вложения —
  отдельная тема от версионирования контента ниже). Физическая чистка —
  фоновый джоб раз в сутки, см. services/attachment_gc.py
  (ATTACHMENT_GC_AFTER_DAYS=180, зарегистрирован в main.py рядом с
  prediction_reminders/contradiction_recheck).

Файлы лежат вне статики uploads/ и отдаются ТОЛЬКО через /download с
Content-Disposition: attachment (см. services/attachment_storage.py).
Картинки сюда не принимаются — у них свой пайплайн (/images).

Версионирование контента (EntityAttachmentVersion): PUT .../file и
PUT .../text заменяют содержимое существующего вложения (тем же id), автор
только владелец вложения; ПЕРЕД перезаписью текущее состояние снимается в
EntityAttachmentVersion (см. _snapshot_version). GET .../versions — список
версий (права как на просмотр вложения), скачивание версии — отдельный
bare-эндпоинт /attachments/{id}/versions/{vid}/download (по аналогии с
/attachments/{id}/download). POST .../versions/{vid}/restore — восстановление
старой версии как текущей, тоже владелец only; это тоже "замена контента" в
терминах выше (текущее состояние перед восстановлением само уходит в новую
версию), но с одним отличием: помимо generic 'updated' от before_flush
(см. event_log.py) явно эмитится attachment_version_restored — это
пользовательское действие, а не техническая деталь версионирования. Файл
версии при restore КОПИРУЕТСЯ в новый storage_path, не расшаривается —
см. докстринг EntityAttachmentVersion в models/entities.py. Retention версий
(180 дней от superseded_at) и чистка файлов-сирот при удалении самого
attachment — services/attachment_gc.py."""
import os
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_current_user_optional
from app.core.entity_registry import ENTITY_MODELS
from app.core.lab_access import get_entity_for_read
from app.db.session import get_db
from app.models.entities import EntityAttachment, EntityAttachmentVersion
from app.models.user import User
from app.schemas.attachments import (
    AttachmentOut, AttachmentDetailOut, AttachmentUploadOut,
    AttachmentTextReplace, AttachmentVersionOut,
)
from app.services import attachment_storage as storage
from app.services.entity_access import require_owned_entity
from app.services.events import emit_event

router = APIRouter(tags=["attachments"])

# Техническая защита памяти (не продуктовый лимит): файлы читаются в память
# по одному, но за запрос их не должно быть неограниченно много. Нужен и
# потолок nginx (client_max_body_size 20M на весь запрос) — фронт шлёт по одному.
MAX_FILES_PER_REQUEST = 10


def _check_entity_type(entity_type: str) -> None:
    if entity_type not in ENTITY_MODELS:
        raise HTTPException(404, "Вложения недоступны для этого типа сущности")


def _to_out(att: EntityAttachment) -> AttachmentOut:
    return AttachmentOut(
        id=att.id, user_id=att.user_id, entity_type=att.entity_type, entity_id=att.entity_id,
        kind=att.kind, filename=att.filename, mime_type=att.mime_type, size_bytes=att.size_bytes,
        language=att.language, has_text_content=att.text_content is not None,
        download_url=f"/api/v1/attachments/{att.id}/download", created_at=att.created_at,
    )


async def _get_owned(db: AsyncSession, entity_type: str, entity_id: int,
                     attachment_id: int, user: User):
    """Владелец вложения (не владелец сущности — это разные роли, ownership
    вложения проверяется тем же способом, что и в delete_attachment).

    Родитель обязан быть жив (не soft-deleted) — решение Алексея (26.09):
    пока сущность лежит в корзине, её вложения нельзя удалять/заменять/
    восстанавливать — сначала восстановите саму сущность. Сам entity-level
    restore/permanent-delete (soft_delete.py/trash.py) этой проверки не
    касается и работает независимо от состояния вложений.

    Возвращает (attachment, parent_entity) — parent отдаётся вызывающему
    коду, чтобы не читать его повторно там, где нужны его visibility/lab_id
    (см. restore_attachment_version) — одно чтение вместо двух отдельных."""
    att = (await db.execute(
        select(EntityAttachment).where(
            EntityAttachment.id == attachment_id,
            EntityAttachment.user_id == user.id,
            EntityAttachment.entity_type == entity_type,
            EntityAttachment.entity_id == entity_id,
            EntityAttachment.deleted_at.is_(None),
        )
    )).scalar_one_or_none()
    if not att:
        raise HTTPException(404, "Вложение не найдено")
    parent = await db.get(ENTITY_MODELS[entity_type], entity_id)
    if parent is None or getattr(parent, "deleted_at", None) is not None:
        raise HTTPException(404, "Сущность в корзине — сначала восстановите её")
    return att, parent


def _version_to_out(v: EntityAttachmentVersion) -> AttachmentVersionOut:
    return AttachmentVersionOut(
        id=v.id, attachment_id=v.attachment_id, filename=v.filename,
        mime_type=v.mime_type, size_bytes=v.size_bytes, language=v.language,
        has_text_content=v.text_content is not None, superseded_at=v.superseded_at,
        download_url=f"/api/v1/attachments/{v.attachment_id}/versions/{v.id}/download",
    )


def _snapshot_version(att: EntityAttachment) -> EntityAttachmentVersion:
    """Снимок текущего состояния ПЕРЕД заменой контента — вызывать до
    присвоения новых значений полям att."""
    return EntityAttachmentVersion(
        attachment_id=att.id, filename=att.filename, storage_path=att.storage_path,
        text_content=att.text_content, mime_type=att.mime_type, size_bytes=att.size_bytes,
        language=att.language, superseded_at=datetime.now(timezone.utc),
    )


async def _get_viewable(db: AsyncSession, attachment_id: int, user: Optional[User]) -> EntityAttachment:
    att = await db.get(EntityAttachment, attachment_id)
    if not att or att.deleted_at is not None:
        raise HTTPException(404, "Не найдено")
    model = ENTITY_MODELS.get(att.entity_type)
    if model is None:
        raise HTTPException(404, "Не найдено")
    await get_entity_for_read(db, model, att.entity_id, user.id if user else None, hide_as_404=True)  # чтение: и запись, открытая через связь
    return att


@router.get("/{entity_type}/{entity_id}/attachments", response_model=List[AttachmentOut])
async def list_attachments(entity_type: str, entity_id: int,
    user: Optional[User] = Depends(get_current_user_optional), db: AsyncSession = Depends(get_db)):
    _check_entity_type(entity_type)
    await get_entity_for_read(db, ENTITY_MODELS[entity_type], entity_id,
                              user.id if user else None, hide_as_404=True)
    rows = (await db.execute(
        select(EntityAttachment).where(
            EntityAttachment.entity_type == entity_type,
            EntityAttachment.entity_id == entity_id,
            EntityAttachment.deleted_at.is_(None),
        ).order_by(EntityAttachment.created_at.desc(), EntityAttachment.id.desc())
    )).scalars().all()
    return [_to_out(r) for r in rows]


@router.post("/{entity_type}/{entity_id}/attachments", response_model=AttachmentUploadOut, status_code=201)
async def upload_attachments(entity_type: str, entity_id: int,
    files: List[UploadFile] = File(...),
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Каждый файл валидируется независимо: принятые сохраняются, отклонённые
    попадают в errors. Если не принят ни один — 400."""
    _check_entity_type(entity_type)
    await require_owned_entity(db, entity_type, entity_id, user)
    if not files:
        raise HTTPException(400, "Нет файлов")
    if len(files) > MAX_FILES_PER_REQUEST:
        raise HTTPException(400, f"Не больше {MAX_FILES_PER_REQUEST} файлов за один запрос")

    created: list[EntityAttachment] = []
    written: list[str] = []
    errors: list[str] = []
    try:
        for file in files:
            raw = await file.read(storage.MAX_ATTACHMENT_SIZE + 1)
            try:
                info = storage.classify_attachment(file.filename, raw)
            except storage.AttachmentRejected as e:
                errors.append(f"{storage.sanitize_filename(file.filename)}: {e}")
                continue
            storage_path = storage.save_attachment_file(raw, info.ext)
            written.append(storage_path)
            att = EntityAttachment(
                user_id=user.id, entity_type=entity_type, entity_id=entity_id,
                kind=info.kind, filename=info.filename, storage_path=storage_path,
                mime_type=info.mime_type, size_bytes=info.size_bytes,
                language=info.language, text_content=info.text_content,
            )
            db.add(att)
            created.append(att)
        if created:
            await db.commit()
            for att in created:
                await db.refresh(att)
    except Exception:
        await db.rollback()
        for name in written:  # не оставляем на диске файлы без строки в БД
            try:
                os.remove(storage.resolve_attachment_path(name))
            except (OSError, ValueError):
                pass
        raise

    if not created:
        raise HTTPException(400, "; ".join(errors) or "Нет файлов")
    return AttachmentUploadOut(created=[_to_out(a) for a in created], errors=errors)


@router.get("/attachments/{attachment_id}", response_model=AttachmentDetailOut)
async def get_attachment(attachment_id: int,
    user: Optional[User] = Depends(get_current_user_optional), db: AsyncSession = Depends(get_db)):
    att = await _get_viewable(db, attachment_id, user)
    base = _to_out(att)
    return AttachmentDetailOut(**base.model_dump(), text_content=att.text_content)


@router.get("/attachments/{attachment_id}/download")
async def download_attachment(attachment_id: int,
    user: Optional[User] = Depends(get_current_user_optional), db: AsyncSession = Depends(get_db)):
    att = await _get_viewable(db, attachment_id, user)
    try:
        path = storage.resolve_attachment_path(att.storage_path)
    except ValueError:
        raise HTTPException(404, "Файл недоступен")
    if not os.path.isfile(path):
        raise HTTPException(404, "Файл недоступен")
    return FileResponse(
        path, media_type=att.mime_type, filename=att.filename,  # Content-Disposition: attachment
        headers={
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "sandbox",
            "Cache-Control": "private, no-store",
        },
    )


@router.delete("/{entity_type}/{entity_id}/attachments/{attachment_id}", status_code=204)
async def delete_attachment(entity_type: str, entity_id: int, attachment_id: int,
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    _check_entity_type(entity_type)
    att, _parent = await _get_owned(db, entity_type, entity_id, attachment_id, user)
    att.deleted_at = datetime.now(timezone.utc)
    await db.commit()


@router.put("/{entity_type}/{entity_id}/attachments/{attachment_id}/file", response_model=AttachmentOut)
async def replace_attachment_file(entity_type: str, entity_id: int, attachment_id: int,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Замена бинарного содержимого. kind меняться не может (нельзя код
    превратить в картинку/другой тип одним PUT'ом) — только контент внутри
    того же kind (например .py -> .js, оба kind=code, разный language)."""
    _check_entity_type(entity_type)
    att, _parent = await _get_owned(db, entity_type, entity_id, attachment_id, user)
    raw = await file.read(storage.MAX_ATTACHMENT_SIZE + 1)
    try:
        info = storage.classify_attachment(file.filename, raw)
    except storage.AttachmentRejected as e:
        raise HTTPException(400, str(e))
    if info.kind != att.kind:
        raise HTTPException(400, f"Нельзя заменить вложение типа «{att.kind}» файлом типа «{info.kind}»")

    new_storage_path = storage.save_attachment_file(raw, info.ext)
    try:
        db.add(_snapshot_version(att))
        att.filename = info.filename
        att.storage_path = new_storage_path
        att.mime_type = info.mime_type
        att.size_bytes = info.size_bytes
        att.language = info.language
        att.text_content = info.text_content
        await db.commit()
        await db.refresh(att)
    except Exception:
        await db.rollback()
        try:
            os.remove(storage.resolve_attachment_path(new_storage_path))
        except (OSError, ValueError):
            pass
        raise
    return _to_out(att)


@router.put("/{entity_type}/{entity_id}/attachments/{attachment_id}/text", response_model=AttachmentDetailOut)
async def replace_attachment_text(entity_type: str, entity_id: int, attachment_id: int,
    payload: AttachmentTextReplace,
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Замена инлайн-текста (code/document). Файл на диске переписывается тем
    же путём, что и при загрузке — storage_path в модели NOT NULL для всех
    kind, включая текстовые. filename здесь НЕ меняется (нет нового файла,
    неоткуда взять новое имя) — язык (language) можно переопределить явно."""
    _check_entity_type(entity_type)
    att, _parent = await _get_owned(db, entity_type, entity_id, attachment_id, user)
    if att.kind not in ("code", "document"):
        raise HTTPException(400, "Замена текста доступна только для вложений code/document")
    if payload.language is not None and payload.language not in storage.VALID_LANGUAGES:
        raise HTTPException(400, f"Неизвестный язык: {payload.language}")

    if "\x00" in payload.text_content:
        raise HTTPException(400, "Текст содержит нулевые байты — это не текстовый файл")
    raw = payload.text_content.encode("utf-8")
    if not raw:
        raise HTTPException(400, "Пустой текст")
    if len(raw) > storage.MAX_INLINE_TEXT_BYTES:
        raise HTTPException(400, f"Текст больше {storage.MAX_INLINE_TEXT_BYTES // 1024} КБ")

    ext = att.storage_path.rsplit(".", 1)[-1] if "." in att.storage_path else ""
    new_storage_path = storage.save_attachment_file(raw, ext)
    try:
        db.add(_snapshot_version(att))
        att.storage_path = new_storage_path
        att.size_bytes = len(raw)
        att.text_content = payload.text_content
        if att.kind == "code" and payload.language is not None:
            att.language = payload.language
        await db.commit()
        await db.refresh(att)
    except Exception:
        await db.rollback()
        try:
            os.remove(storage.resolve_attachment_path(new_storage_path))
        except (OSError, ValueError):
            pass
        raise
    base = _to_out(att)
    return AttachmentDetailOut(**base.model_dump(), text_content=att.text_content)


@router.get("/{entity_type}/{entity_id}/attachments/{attachment_id}/versions", response_model=List[AttachmentVersionOut])
async def list_attachment_versions(entity_type: str, entity_id: int, attachment_id: int,
    user: Optional[User] = Depends(get_current_user_optional), db: AsyncSession = Depends(get_db)):
    _check_entity_type(entity_type)
    att = await _get_viewable(db, attachment_id, user)
    if att.entity_type != entity_type or att.entity_id != entity_id:
        raise HTTPException(404, "Не найдено")
    rows = (await db.execute(
        select(EntityAttachmentVersion)
        .where(EntityAttachmentVersion.attachment_id == attachment_id)
        .order_by(EntityAttachmentVersion.superseded_at.desc())
    )).scalars().all()
    return [_version_to_out(v) for v in rows]


@router.get("/attachments/{attachment_id}/versions/{version_id}/download")
async def download_attachment_version(attachment_id: int, version_id: int,
    user: Optional[User] = Depends(get_current_user_optional), db: AsyncSession = Depends(get_db)):
    att = await _get_viewable(db, attachment_id, user)
    version = await db.get(EntityAttachmentVersion, version_id)
    if not version or version.attachment_id != att.id:
        raise HTTPException(404, "Версия не найдена")
    try:
        path = storage.resolve_attachment_path(version.storage_path)
    except ValueError:
        raise HTTPException(404, "Файл недоступен")
    if not os.path.isfile(path):
        raise HTTPException(404, "Файл недоступен")
    return FileResponse(
        path, media_type=version.mime_type, filename=version.filename,
        headers={
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "sandbox",
            "Cache-Control": "private, no-store",
        },
    )


@router.post("/{entity_type}/{entity_id}/attachments/{attachment_id}/versions/{version_id}/restore", response_model=AttachmentOut)
async def restore_attachment_version(entity_type: str, entity_id: int, attachment_id: int, version_id: int,
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Восстановление старой версии — тоже 'замена содержимого' в терминах
    /file и /text: текущее состояние перед восстановлением само уходит в
    новую версию. Файл версии КОПИРУЕТСЯ в новый storage_path (не
    расшаривается ссылка) — иначе просроченный по возрасту файл версии мог
    бы быть физически удалён GC, пока на него ссылается живое вложение."""
    _check_entity_type(entity_type)
    att, parent = await _get_owned(db, entity_type, entity_id, attachment_id, user)
    version = await db.get(EntityAttachmentVersion, version_id)
    if not version or version.attachment_id != att.id:
        raise HTTPException(404, "Версия не найдена")

    try:
        src_path = storage.resolve_attachment_path(version.storage_path)
    except ValueError:
        raise HTTPException(404, "Файл версии недоступен")
    if not os.path.isfile(src_path):
        raise HTTPException(404, "Файл версии недоступен")
    ext = version.storage_path.rsplit(".", 1)[-1] if "." in version.storage_path else ""
    new_storage_path = storage.copy_attachment_file(src_path, ext)

    try:
        db.add(_snapshot_version(att))
        att.filename = version.filename
        att.storage_path = new_storage_path
        att.mime_type = version.mime_type
        att.size_bytes = version.size_bytes
        att.language = version.language
        att.text_content = version.text_content
        visibility = getattr(parent, "visibility", "private") or "private"
        lab_id = getattr(parent, "lab_id", None)
        await emit_event(
            db, type="attachment_version_restored", actor_id=user.id,
            entity_type="attachment", entity_id=att.id,
            related_type=entity_type, related_id=entity_id,
            visibility=visibility, lab_id=lab_id,
            meta={"restored_version_id": version.id},
        )
        await db.commit()
        await db.refresh(att)
    except Exception:
        await db.rollback()
        try:
            os.remove(storage.resolve_attachment_path(new_storage_path))
        except (OSError, ValueError):
            pass
        raise
    return _to_out(att)
