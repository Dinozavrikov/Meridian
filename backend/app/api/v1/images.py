from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from app.db.session import get_db
from app.core.deps import get_current_user, get_current_user_optional
from app.core.entity_registry import ENTITY_MODELS as BASE_ENTITY_MODELS
from app.core.lab_access import get_entity_for_read
from app.models.user import User
from app.models.entities import EntityImage, Result
from app.schemas.entities import EntityImageOut, ALLOWED_IMAGE_ENTITY_TYPES
from app.services.image_processing import (
    process_image, save_processed, resolve_image_path,
    ALLOWED_CONTENT_TYPES, MAX_UPLOAD_SIZE, IMAGES_DIR,
)
from app.services.entity_image_description import generate_image_description
import os

router = APIRouter(prefix="/{entity_type}/{entity_id}/images", tags=["images"])

# 6 базовых типов — из единого реестра (app/core/entity_registry.py), не третья
# локальная копия; result добавлен отдельно: у картинок он допустим, а в
# ENTITY_MODELS его нет (реестр — ровно 6 базовых сущностей).
ENTITY_MODELS = {**BASE_ENTITY_MODELS, "result": Result}


def _check_entity_type(entity_type: str) -> None:
    if entity_type not in ALLOWED_IMAGE_ENTITY_TYPES:
        raise HTTPException(404, "Изображения недоступны для этого типа сущности")


async def _require_owner(db: AsyncSession, entity_type: str, entity_id: int, user: User):
    """404 (не 403), если сущности нет или она чужая — как в comments.py,
    чтобы перебор id не раскрывал факт существования записи."""
    model = ENTITY_MODELS.get(entity_type)
    if model is None:
        raise HTTPException(400, "Invalid entity type")
    entity = await db.get(model, entity_id)
    if not entity or entity.user_id != user.id or getattr(entity, "deleted_at", None) is not None:  # корзина = 404
        raise HTTPException(404, "Не найдено")
    return entity


async def _require_view(db: AsyncSession, entity_type: str, entity_id: int, user: Optional[User]) -> None:
    """Чтение списка картинок — по правилам видимости самой сущности (владелец /
    участник лабы / гость для public), недоступное скрываем как 404. Для result
    правила видимости другие (is_published) и на этом пути не проверены — там
    по-прежнему только владелец."""
    base_model = BASE_ENTITY_MODELS.get(entity_type)
    if base_model is not None:
        await get_entity_for_read(db, base_model, entity_id, user.id if user else None, hide_as_404=True)  # чтение: и запись, открытая через связь
        return
    if user is None:
        raise HTTPException(404, "Не найдено")
    await _require_owner(db, entity_type, entity_id, user)


def _to_out(img: EntityImage) -> EntityImageOut:
    return EntityImageOut(
        id=img.id, entity_type=img.entity_type, entity_id=img.entity_id,
        url=f"/api/uploads/entity_images/{img.filename}",
        thumb_url=f"/api/uploads/entity_images/{img.thumb_filename}",
        width=img.width, height=img.height,
        size_bytes=img.size_bytes, orig_size_bytes=img.orig_size_bytes,
        created_at=img.created_at,
    )


@router.get("", response_model=List[EntityImageOut])
async def list_images(entity_type: str, entity_id: int,
    user: Optional[User] = Depends(get_current_user_optional), db: AsyncSession = Depends(get_db)):
    _check_entity_type(entity_type)
    await _require_view(db, entity_type, entity_id, user)
    rows = (await db.execute(
        select(EntityImage)
        .where(EntityImage.entity_type == entity_type, EntityImage.entity_id == entity_id)
        .order_by(EntityImage.created_at.desc())
    )).scalars().all()
    return [_to_out(r) for r in rows]


@router.post("", response_model=List[EntityImageOut], status_code=201)
async def upload_images(entity_type: str, entity_id: int,
    background_tasks: BackgroundTasks,
    files: List[UploadFile] = File(...),
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Массовая загрузка — неограниченное число файлов за раз. Каждый файл
    независимо валидируется, сжимается (image_processing.process_image) и
    сохраняется; при ошибке в одном файле остальные всё равно обрабатываются."""
    _check_entity_type(entity_type)
    await _require_owner(db, entity_type, entity_id, user)

    if not files:
        raise HTTPException(400, "Нет файлов")

    created: list[EntityImage] = []
    errors: list[str] = []

    for file in files:
        if file.content_type not in ALLOWED_CONTENT_TYPES:
            errors.append(f"{file.filename}: неподдерживаемый формат")
            continue
        raw = await file.read()
        if len(raw) > MAX_UPLOAD_SIZE:
            errors.append(f"{file.filename}: файл больше 20 МБ")
            continue
        try:
            processed = process_image(raw)
        except Exception:
            errors.append(f"{file.filename}: не удалось обработать изображение")
            continue

        filename, thumb_filename = save_processed(processed, IMAGES_DIR)

        img = EntityImage(
            user_id=user.id, entity_type=entity_type, entity_id=entity_id,
            filename=filename, thumb_filename=thumb_filename,
            width=processed.width, height=processed.height,
            size_bytes=len(processed.full_bytes), orig_size_bytes=processed.orig_size,
        )
        db.add(img)
        created.append(img)

    if created:
        await db.commit()
        for img in created:
            await db.refresh(img)

    if not created and errors:
        raise HTTPException(400, "; ".join(errors))

    for img in created:
        background_tasks.add_task(generate_image_description, img.id, os.path.join(IMAGES_DIR, img.filename))

    return [_to_out(img) for img in created]


@router.delete("/{image_id}", status_code=204)
async def delete_image(entity_type: str, entity_id: int, image_id: int,
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    _check_entity_type(entity_type)
    img = (await db.execute(
        select(EntityImage).where(
            EntityImage.id == image_id,
            EntityImage.user_id == user.id,
            EntityImage.entity_type == entity_type,
            EntityImage.entity_id == entity_id,
        )
    )).scalar_one_or_none()
    if not img:
        raise HTTPException(404, "Изображение не найдено")

    for fn in (img.filename, img.thumb_filename):
        try:
            path = resolve_image_path(fn)
        except ValueError:
            continue
        if os.path.exists(path):
            try:
                os.remove(path)
            except OSError:
                pass

    await db.delete(img)
    await db.commit()
