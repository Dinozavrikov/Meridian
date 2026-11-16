"""
Единый сервис обработки изображений для вложений сущностей (entity_images).
Используется одинаково для наблюдений, гипотез, прогнозов, убеждений,
вопросов и задач — весь код сжатия/ресайза живёт в одном месте, чтобы не
дублировать логику под каждый тип сущности.

Стратегия сжатия:
  - Полноразмерная версия: пропорциональный ресайз с ограничением по
    большей стороне (MAX_DIM), сохранение в WebP с качеством QUALITY_FULL.
    WebP при том же визуальном качестве обычно в 2-3 раза легче JPEG/PNG.
  - Миниатюра: тот же ресайз до THUMB_DIM, качество пониже — только для
    сеток превью, где детализация не нужна.
  - EXIF-ориентация применяется до ресайза (иначе фото с телефона могут
    сохраниться повёрнутыми на 90°).
"""
import io
import os
import uuid
from PIL import Image, ImageOps

MAX_DIM = 1920
THUMB_DIM = 320
QUALITY_FULL = 82
QUALITY_THUMB = 75

# Каталог хранения изображений сущностей — единый источник для всех, кто
# работает с файлами EntityImage (раньше дублировался как локальная
# константа прямо в api/v1/images.py). Совпадает по духу с ATTACHMENTS_DIR
# в attachment_storage.py: путь на диск строится только здесь.
IMAGES_DIR = "uploads/entity_images"

ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"}
MAX_UPLOAD_SIZE = 20 * 1024 * 1024  # 20MB — до сжатия, HEIC с айфонов бывают тяжёлыми


class ProcessedImage:
    __slots__ = ("full_bytes", "thumb_bytes", "width", "height", "orig_size")

    def __init__(self, full_bytes: bytes, thumb_bytes: bytes, width: int, height: int, orig_size: int):
        self.full_bytes = full_bytes
        self.thumb_bytes = thumb_bytes
        self.width = width
        self.height = height
        self.orig_size = orig_size


def _resize_to_fit(img: Image.Image, max_dim: int) -> Image.Image:
    w, h = img.size
    if max(w, h) <= max_dim:
        return img
    scale = max_dim / max(w, h)
    return img.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)


def process_image(raw: bytes) -> ProcessedImage:
    """Принимает сырые байты загруженного файла, возвращает сжатые
    полноразмерную версию и миниатюру в формате WebP."""
    img = Image.open(io.BytesIO(raw))
    img = ImageOps.exif_transpose(img)  # учесть поворот с камеры
    if img.mode not in ("RGB", "RGBA"):
        img = img.convert("RGBA" if "A" in img.mode else "RGB")

    full_img = _resize_to_fit(img, MAX_DIM)
    full_buf = io.BytesIO()
    full_img.save(full_buf, format="WEBP", quality=QUALITY_FULL, method=6)

    thumb_img = _resize_to_fit(img, THUMB_DIM)
    thumb_buf = io.BytesIO()
    thumb_img.save(thumb_buf, format="WEBP", quality=QUALITY_THUMB, method=6)

    return ProcessedImage(
        full_bytes=full_buf.getvalue(),
        thumb_bytes=thumb_buf.getvalue(),
        width=full_img.width,
        height=full_img.height,
        orig_size=len(raw),
    )


def resolve_image_path(filename: str) -> str:
    """Безопасный путь к файлу изображения по имени из БД (defense in depth:
    filename/thumb_filename генерируем мы сами через uuid4, но всё равно не
    допускаем выхода из каталога) — тот же паттерн, что
    attachment_storage.py::resolve_attachment_path."""
    if not filename or filename in (".", "..") or os.path.basename(filename) != filename:
        raise ValueError("недопустимое имя файла изображения")
    return os.path.join(IMAGES_DIR, filename)


def save_processed(processed: ProcessedImage, directory: str) -> tuple[str, str]:
    """Сохраняет обе версии на диск, возвращает (filename, thumb_filename)."""
    os.makedirs(directory, exist_ok=True)
    base = uuid.uuid4().hex
    filename = f"{base}.webp"
    thumb_filename = f"{base}_thumb.webp"
    with open(os.path.join(directory, filename), "wb") as f:
        f.write(processed.full_bytes)
    with open(os.path.join(directory, thumb_filename), "wb") as f:
        f.write(processed.thumb_bytes)
    return filename, thumb_filename
