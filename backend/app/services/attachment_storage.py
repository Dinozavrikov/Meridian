"""Классификация, валидация и хранение файловых вложений (EntityAttachment).

Принципы:
- Тип файла определяем САМИ: по расширению (белый список) и содержимому
  (магические байты / структура zip / валидный UTF-8). Content-Type от клиента
  игнорируется — браузеры отдают для .ts «video/mp2t», для .py
  «application/octet-stream» и т.п., доверять нельзя.
- Белый список закрытый: HTML/SVG/XML/исполняемые и всё незнакомое отклоняются
  (при раздаче с нашего origin они были бы вектором XSS). Картинки сюда не
  принимаются — у них свой пайплайн (EntityImage, /images).
- Файлы лежат в ATTACHMENTS_DIR — ВНЕ статически раздаваемого uploads/
  (main.py монтирует uploads как публичную статику без проверки прав).
  Имя на диске генерирует сервер (uuid + расширение из белого списка);
  оригинальное имя хранится только в БД и только для показа.
- Лимиты: MAX_ATTACHMENT_SIZE (nginx режет запрос на 20M — запас есть),
  MAX_INLINE_TEXT_BYTES — выше этого текст не дублируется в БД
  (text_content=NULL), файл доступен только на скачивание.
"""
import io
import os
import re
import uuid
import zipfile
from dataclasses import dataclass

ATTACHMENTS_DIR = "attachments"
MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024
MAX_INLINE_TEXT_BYTES = 256 * 1024
MAX_FILENAME_LEN = 255

# расширение -> язык для подсветки на фронте
CODE_EXTENSIONS: dict[str, str] = {
    "py": "python", "js": "javascript", "mjs": "javascript", "ts": "typescript",
    "tsx": "tsx", "jsx": "jsx", "json": "json", "yaml": "yaml", "yml": "yaml",
    "toml": "toml", "ini": "ini", "sql": "sql", "sh": "bash", "bash": "bash",
    "go": "go", "rs": "rust", "c": "c", "h": "c", "cpp": "cpp", "hpp": "cpp",
    "java": "java", "kt": "kotlin", "rb": "ruby", "php": "php", "css": "css",
    "lua": "lua", "cs": "csharp", "swift": "swift",
}
# файлы кода без расширения
CODE_FILENAMES: dict[str, str] = {"dockerfile": "dockerfile", "makefile": "makefile"}
# Допустимые значения language при явном PUT .../text (attachments.py) — те же,
# что сервер сам присваивает при автоопределении по расширению, плюс значения
# из CODE_FILENAMES (dockerfile/makefile — тоже валидные языки для подсветки).
VALID_LANGUAGES: frozenset[str] = frozenset(CODE_EXTENSIONS.values()) | frozenset(CODE_FILENAMES.values())
TEXT_DOC_MIME: dict[str, str] = {"txt": "text/plain", "md": "text/markdown", "csv": "text/csv"}
BINARY_DOC_MIME: dict[str, str] = {
    "pdf": "application/pdf",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}
ZIP_MARKERS: dict[str, str] = {"docx": "word/document.xml", "xlsx": "xl/workbook.xml"}
IMAGE_EXTENSIONS = {"jpg", "jpeg", "png", "webp", "gif", "heic", "heif", "bmp", "tif", "tiff"}


class AttachmentRejected(ValueError):
    """Файл не принят; текст исключения — сообщение для пользователя."""


@dataclass(frozen=True)
class ClassifiedFile:
    kind: str                 # code | document | other
    mime_type: str            # серверный, не от клиента
    ext: str                  # нижний регистр, без точки ("" для Dockerfile и т.п.)
    filename: str             # санированное оригинальное имя
    size_bytes: int
    language: str | None
    text_content: str | None  # только текстовые файлы ≤ MAX_INLINE_TEXT_BYTES


_CTRL_CHARS = re.compile(r"[\x00-\x1f\x7f]")


def sanitize_filename(name: str | None) -> str:
    """Только basename, без управляющих символов, не длиннее 255 (расширение
    сохраняется). Используется исключительно для показа — на диск имя не идёт."""
    base = os.path.basename((name or "").replace("\\", "/"))
    base = _CTRL_CHARS.sub("", base).strip()
    if not base:
        return "file"
    if len(base) > MAX_FILENAME_LEN:
        stem, dot, ext = base.rpartition(".")
        if dot and 0 < len(ext) <= 16:
            base = stem[: MAX_FILENAME_LEN - len(ext) - 1] + "." + ext
        else:
            base = base[:MAX_FILENAME_LEN]
    return base


def _split_ext(filename: str) -> tuple[str, str]:
    base = filename.lower()
    _, dot, ext = base.rpartition(".")
    return (ext if dot else ""), base


def _decode_text(raw: bytes) -> str:
    if b"\x00" in raw:
        # Postgres не хранит NUL в TEXT — без этой проверки был бы 500, а не отказ.
        raise AttachmentRejected("Файл содержит нулевые байты — это не текстовый файл")
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        raise AttachmentRejected("Ожидался текст в кодировке UTF-8")
    return text.lstrip("\ufeff")


def _zip_names(raw: bytes) -> list[str]:
    try:
        with zipfile.ZipFile(io.BytesIO(raw)) as z:
            return z.namelist()
    except zipfile.BadZipFile:
        return []


def classify_attachment(filename: str | None, raw: bytes) -> ClassifiedFile:
    size = len(raw)
    if size == 0:
        raise AttachmentRejected("Пустой файл")
    if size > MAX_ATTACHMENT_SIZE:
        raise AttachmentRejected(f"Файл больше {MAX_ATTACHMENT_SIZE // (1024 * 1024)} МБ")

    safe_name = sanitize_filename(filename)
    ext, base = _split_ext(safe_name)

    if ext in IMAGE_EXTENSIONS:
        raise AttachmentRejected("Изображения загружаются через вкладку изображений")

    if ext in CODE_EXTENSIONS or (not ext and base in CODE_FILENAMES):
        language = CODE_EXTENSIONS.get(ext) or CODE_FILENAMES[base]
        text = _decode_text(raw)
        return ClassifiedFile("code", "text/plain", ext, safe_name, size, language,
                              text if size <= MAX_INLINE_TEXT_BYTES else None)

    if ext in TEXT_DOC_MIME:
        text = _decode_text(raw)
        return ClassifiedFile("document", TEXT_DOC_MIME[ext], ext, safe_name, size, None,
                              text if size <= MAX_INLINE_TEXT_BYTES else None)

    if ext in BINARY_DOC_MIME:
        ok = raw.startswith(b"%PDF-") if ext == "pdf" else ZIP_MARKERS[ext] in _zip_names(raw)
        if not ok:
            raise AttachmentRejected(f"Содержимое файла не похоже на .{ext}")
        return ClassifiedFile("document", BINARY_DOC_MIME[ext], ext, safe_name, size, None, None)

    if ext == "zip":
        if not zipfile.is_zipfile(io.BytesIO(raw)):
            raise AttachmentRejected("Содержимое файла не похоже на .zip")
        return ClassifiedFile("other", "application/zip", ext, safe_name, size, None, None)

    raise AttachmentRejected(f"Тип файла не поддерживается: .{ext}" if ext else "Тип файла не поддерживается")


def save_attachment_file(raw: bytes, ext: str) -> str:
    """Пишет файл в ATTACHMENTS_DIR под серверным именем, возвращает его
    (это и есть storage_path). ext — из белого списка (ClassifiedFile.ext)."""
    directory = ATTACHMENTS_DIR
    os.makedirs(directory, exist_ok=True)
    name = f"{uuid.uuid4().hex}.{ext or 'dat'}"
    with open(os.path.join(directory, name), "xb") as f:  # "x": никогда не перезаписываем
        f.write(raw)
    return name


def copy_attachment_file(src_path: str, ext: str) -> str:
    """Копирует существующий файл вложения в новый файл с новым серверным
    именем (используется restore версии — новый storage_path, не расшаренная
    ссылка на файл старой версии, см. докстринг EntityAttachmentVersion:
    иначе просроченный по времени файл версии мог бы быть физически удалён
    GC, пока на него ссылается ещё что-то живое)."""
    with open(src_path, "rb") as f:
        raw = f.read()
    return save_attachment_file(raw, ext)


def resolve_attachment_path(storage_path: str) -> str:
    """Безопасный путь к файлу по storage_path из БД (defense in depth:
    storage_path генерируем мы, но всё равно не допускаем выхода из каталога)."""
    if not storage_path or storage_path in (".", "..") or os.path.basename(storage_path) != storage_path:
        raise ValueError("недопустимый storage_path")
    return os.path.join(ATTACHMENTS_DIR, storage_path)
