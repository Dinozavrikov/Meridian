"""Белый список для /i18n/ensure-content: какие поля какого типа записи вообще можно переводить.

Кэш переводов ключуется по (тип, id, поле), а сервер переводит присланный текст как есть, поэтому без списка
любой вошедший пользователь мог гнать через модель произвольный текст под произвольным ключом.
Формат строк в _ROWS разбирает охранный тест фронтенда (lib/i18n/translatable-fields.guard.test.ts):
по одной записи «"тип": ("поле", ...),» на строку. Новое поле на фронтенде без строки здесь роняет этот тест.
Для базовых типов title/preview/preview_title/preview_excerpt общие: ими пользуются связи, досье и карточка предпросмотра."""

_ROWS: dict[str, tuple[str, ...]] = {
    "observation": ("title", "text", "preview", "preview_html", "preview_title", "preview_excerpt"),
    "hypothesis": ("name", "description", "title", "preview", "preview_html", "preview_title", "preview_excerpt"),
    "prediction": ("title", "text", "preview", "preview_html", "preview_title", "preview_excerpt"),
    "worldview": ("belief", "confirming_data", "refuting_data", "title", "preview", "preview_html", "preview_title", "preview_excerpt"),
    "question": ("title", "text", "answer", "preview", "preview_html", "preview_title", "preview_excerpt"),
    "task": ("name", "description", "title", "preview", "preview_html", "preview_title", "preview_excerpt"),
    "result": ("title", "body", "preview"),
    "lab": ("name", "description"),
    "lab_join_request": ("message",),
    "comment": ("content",),
    "obs_post": ("title", "preview", "preview_html"),
    "message": ("text",),
    "source_document": ("title", "summary", "verdict_reason", "weight_reason"),
    "user": ("bio",),
}

TRANSLATABLE_FIELDS: dict[str, frozenset[str]] = {t: frozenset(f) for t, f in _ROWS.items()}
MAX_CONTENT_ITEMS = 500
MAX_CONTENT_TEXT = 50_000      # символов в одном пункте
MAX_CONTENT_TOTAL = 500_000    # символов во всём запросе
