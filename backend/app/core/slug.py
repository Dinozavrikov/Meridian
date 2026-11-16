"""Генерация slug для 6 базовых сущностей (ENTITY_MODELS) и вспомогательных
записей (цель лабы, репост, онбординг-сид) — единая точка, app.core.slug.

Уникальность — простая, глобальная по таблице (UniqueConstraint("slug", ...),
см. модели): каждый slug получает случайный суффикс (make_slug(name) + 6
случайных символов), поэтому конфликт между разными пользователями/лабами
практически невозможен (36^6 ≈ 2*10^9 комбинаций на суффикс) — не нужно ни
partial-индексов по scope, ни переименования при смене lab_id/restore/
удалении лабы, ни истории старых slug'ов: slug, единожды выданный, никогда
не меняется и никогда ни с кем не конфликтует.

(История: до этого здесь был вариант с partial-уникальностью по scope и
автопереименованием при конфликте (миграция b2f7a1c9e408) — пересмотрено:
он решал исходную проблему (два разных пользователя не могли получить
одинаковый slug) ценой четырёх точек риска (смена lab_id, restore,
delete_lab, disambiguation при чтении по slug). Правильнее не допускать
конфликт вовсе, а не разруливать его постфактум — см. миграцию
f4d8b6c2a913, откатывающую partial-схему.)"""
import re
import secrets

from sqlalchemy import select

_TRANSLIT = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "e",
    "ж": "zh", "з": "z", "и": "i", "й": "y", "к": "k", "л": "l", "м": "m",
    "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u",
    "ф": "f", "х": "h", "ц": "ts", "ч": "ch", "ш": "sh", "щ": "sch",
    "ъ": "", "ы": "y", "ь": "", "э": "e", "ю": "yu", "я": "ya",
}

_SUFFIX_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789"
_SUFFIX_LEN = 6


def transliterate(text: str) -> str:
    result = []
    for ch in text.lower():
        result.append(_TRANSLIT.get(ch, ch))
    return "".join(result)


def make_slug(name: str, max_len: int = 64) -> str:
    """Базовая (человекочитаемая) часть slug: транслитерация кириллицы,
    нижний регистр, пробелы/спецсимволы -> дефис. Финальный slug =
    make_slug(name) + случайный суффикс, см. unique_slug_for."""
    s = transliterate(name or "")
    s = re.sub(r"[^a-z0-9\s-]", "", s)
    s = re.sub(r"[\s_-]+", "-", s).strip("-")
    if not s:
        s = "item"
    return s[:max_len]


def _random_suffix() -> str:
    return "".join(secrets.choice(_SUFFIX_ALPHABET) for _ in range(_SUFFIX_LEN))


async def unique_slug_for(db, model, base_name: str, max_attempts: int = 5) -> str:
    """Единый генератор slug для всех мест, где он нужен: 6 базовых сущностей
    (create-роуты), цель лабы (labs.py::create_lab), онбординг-сид (auth.py),
    репост (repost.py). Суффикс случайный, не инкрементирующийся счётчик — так
    slug не выдаёт, сколько раз до этого совпало название, и коллизия между
    независимыми пользователями/лабами практически исключена без привязки к
    scope. Проверка — по всей таблице, включая записи в корзине (та же
    глобальная область, что и у самого UniqueConstraint в БД — deleted_at
    здесь сознательно не фильтруется, иначе проверка приложения разошлась бы
    с constraint'ом). Ретрай — на случай истинной (астрономически редкой)
    коллизии."""
    base = make_slug(base_name)
    for _ in range(max_attempts):
        slug = f"{base}-{_random_suffix()}"
        exists = await db.scalar(select(model.id).where(model.slug == slug))
        if not exists:
            return slug
    raise RuntimeError(f"Не удалось сгенерировать уникальный slug для {base!r} за {max_attempts} попыток")
