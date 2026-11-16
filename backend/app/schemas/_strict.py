"""Строгий вход для API. Принцип: недопустимое ОТВЕРГАЕМ (422), ничего не переписываем: хеши снимков
считаются по сырому тексту, а HTML чистится при показе (frontend/lib/sanitize-html.ts).
StrictIn — база для всех входных схем: ни NUL (роняет запись в Postgres), ни управляющих символов
(кроме \\t \\n \\r), ни одиночных суррогатов (не кодируются в UTF-8). Лимиты длины взяты из колонок моделей."""
from datetime import date
from typing import Annotated, Any, List, Literal
import re

from pydantic import AfterValidator, BaseModel, Field, StringConstraints, field_validator

_BAD_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f\ud800-\udfff]")


def _scan(v: Any) -> Any:
    if isinstance(v, str):
        if _BAD_CHARS.search(v):
            raise ValueError("Недопустимые управляющие символы")
    elif isinstance(v, (list, tuple)):
        for x in v:
            _scan(x)
    elif isinstance(v, dict):
        for k, x in v.items():
            _scan(k)
            _scan(x)
    return v


class StrictIn(BaseModel):
    @field_validator("*", mode="after")
    @classmethod
    def _no_bad_chars(cls, v):
        return _scan(v)


def _iso_date(v: str) -> str:
    try:
        date.fromisoformat(v)
    except ValueError:
        raise ValueError("Дата в формате ГГГГ-ММ-ДД")
    return v


def _s(n: int):
    return Annotated[str, StringConstraints(max_length=n)]


Short32, Short64, Short128, Short255 = _s(32), _s(64), _s(128), _s(255)
NonEmpty255 = Annotated[str, StringConstraints(max_length=255, strip_whitespace=True, min_length=1)]

from app.core.plain_text import plain_text as _plain_text


def _not_blank_html(v: str) -> str:
    if not _plain_text(v):
        raise ValueError("Не может быть пустым")
    return v


# Rich-text поле: "<p></p>", "<p><br></p>", "<p>&nbsp;</p>" — это пусто.
RichRequired = Annotated[str, StringConstraints(max_length=1_000_000), AfterValidator(_not_blank_html)]
LongText = _s(1_000_000)  # колонки Text: лимит от DoS, а не от «слишком длинной мысли»
DateStr = Annotated[str, StringConstraints(pattern=r"^[0-9]{4}-[0-9]{2}-[0-9]{2}$"), AfterValidator(_iso_date)]
Visibility = Literal["private", "public", "lab"]
Int32 = Annotated[int, Field(ge=-(2 ** 31), le=2 ** 31 - 1)]  # только защита от переполнения, не бизнес-диапазон
Tags = Annotated[List[Short128], Field(max_length=100)]


_URL_RE = re.compile(r"https?://\S+", re.I)


def _http_url(v: str) -> str:
    if not _URL_RE.fullmatch(v):
        raise ValueError("Нужен адрес вида http:// или https://")
    return v


# strip — единственное «переписывание»: URL после обрезки пробелов хранится и хешируется уже чистым
HttpUrlStr = Annotated[str, StringConstraints(max_length=2048, strip_whitespace=True), AfterValidator(_http_url)]


Short16 = _s(16)
