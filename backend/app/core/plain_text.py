"""Текст из rich-text HTML. Единственное место на бэкенде, где решается, что такое «пусто»."""
import html
import re

_TAG_RE = re.compile(r"<[^>]*>")
_WS_RE = re.compile(r"\s+")


def plain_text(v: str) -> str:
    """Как фронтовый stripHtml(html).trim(): теги убираются, сущности раскрываются."""
    return html.unescape(_TAG_RE.sub("", v)).strip()


def derive_title(text: str, limit: int = 60) -> str:
    """Заголовок-заготовка из текста: теги -> пробел, схлопнутые пробелы, первые `limit` символов.
    Пустая строка, если в тексте нечего взять. Правило то же, что в миграции-бэкфилле."""
    raw = html.unescape(_TAG_RE.sub(" ", text or ""))
    return _WS_RE.sub(" ", raw).strip()[:limit].strip()
