import os
from app.db.session import AsyncSessionLocal
from app.models.entities import (
    EntityImage, Hypothesis, Prediction, Observation, Question, ResearchTask, Worldview,
)
from app.services.ai import describe_image

# (модель, поле-заголовок или None, поле-текст) — те же типы, что в images.py/ALLOWED_IMAGE_ENTITY_TYPES
_CONTEXT_FIELDS = {
    "hypothesis":  (Hypothesis,   "name",  "description"),
    "prediction":  (Prediction,   "title", "text"),
    "observation": (Observation,  "title", "text"),
    "question":    (Question,     "title", "text"),
    "task":        (ResearchTask, "name",  "description"),
    "worldview":   (Worldview,    None,    "belief"),
}


async def _get_entity_context(db, entity_type: str, entity_id: int) -> str | None:
    """Текст сущности (заголовок + описание/текст), к которой прикреплена
    картинка — передаётся в vision-промт, чтобы модель сама решила, какие
    детали на картинке важнее (эмоции для кастинга, цифры для графика и т.п.),
    вместо жёстко закодированных категорий."""
    entry = _CONTEXT_FIELDS.get(entity_type)
    if not entry:
        return None
    model, title_attr, text_attr = entry
    entity = await db.get(model, entity_id)
    if not entity:
        return None
    parts = []
    if title_attr:
        title_val = getattr(entity, title_attr, "")
        if title_val:
            parts.append(title_val)
    text_val = getattr(entity, text_attr, "")
    if text_val:
        parts.append(text_val[:500])  # не тащим огромные описания целиком в промт
    return " — ".join(parts) if parts else None


async def generate_image_description(image_id: int, filepath: str):
    """BackgroundTask после загрузки картинки — открывает свою сессию,
    т.к. запрос-инициатор (upload_images) уже завершится к этому моменту.
    Best-effort: если vision недоступен, описание останется NULL, и картинка
    просто не попадёт в промт рефлексии — не блокирует ни загрузку, ни фичу."""
    print(f"[image-desc] старт для image_id={image_id}, filepath={filepath}", flush=True)
    async with AsyncSessionLocal() as db:
        img = await db.get(EntityImage, image_id)
        if not img:
            print(f"[image-desc] EntityImage id={image_id} не найден в БД", flush=True)
            return
        context = await _get_entity_context(db, img.entity_type, img.entity_id)
        try:
            with open(filepath, "rb") as f:
                raw = f.read()
        except FileNotFoundError:
            print(f"[image-desc] файл не найден: {filepath} (cwd={os.getcwd()})", flush=True)
            return
        print(f"[image-desc] файл прочитан, {len(raw)} байт, вызываю describe_image", flush=True)
        description = await describe_image(raw, content_type="image/webp", context=context)
        print(f"[image-desc] результат describe_image: {description!r}", flush=True)
        if description:
            img.description = description
            await db.commit()
            print(f"[image-desc] сохранено для image_id={image_id}", flush=True)
