"""Перевод HTML с сохранением ссылок. Модель получает текст, где каждый тег заменен
маркером [[n]]; после перевода маркеры возвращаются на место из сохраненного списка, поэтому
href и прочие атрибуты берутся из оригинала, а не из ответа модели. Любое расхождение
(потерян или продублирован маркер, нарушена вложенность, модель добавила свои теги)
дает None, и вызывающий код оставляет перевод без разметки."""
import html
import re

_TAG_RE = re.compile(r"<[^>]+>")
_TOKEN_RE = re.compile(r"\[\[\s*(\d+)\s*\]\]")
_NAME_RE = re.compile(r"</?\s*([a-zA-Z][a-zA-Z0-9]*)")
_VOID = {"br", "hr", "img", "input", "wbr"}


def has_markup(text: str) -> bool:
    return bool(_TAG_RE.search(text))


def mask_html(html: str) -> tuple[str, list[str]]:
    """(текст с маркерами, список тегов). Если в оригинале уже есть что-то похожее на маркер,
    разметка отбрасывается целиком: безопаснее потерять ссылки, чем перепутать их."""
    if _TOKEN_RE.search(html):
        return _TAG_RE.sub("", html), []
    tags: list[str] = []

    def put(m: re.Match) -> str:
        tags.append(m.group(0))
        return f"[[{len(tags) - 1}]]"

    return _TAG_RE.sub(put, html), tags


def unmask_html(translated: str, tags: list[str]) -> str | None:
    if _TAG_RE.search(translated):  # модель добавила собственную разметку
        return None
    found = [int(m.group(1)) for m in _TOKEN_RE.finditer(translated)]
    if sorted(found) != list(range(len(tags))):
        return None
    stack: list[str] = []
    for i in found:
        tag = tags[i]
        m = _NAME_RE.match(tag)
        name = m.group(1).lower() if m else ""
        if tag.startswith("</"):
            if not stack or stack.pop() != name:
                return None
        elif name and name not in _VOID and not tag.endswith("/>"):
            stack.append(name)
    return _TOKEN_RE.sub(lambda m: tags[int(m.group(1))], translated)


def drop_markers(translated: str) -> str:
    """Запасной вариант: перевод без разметки."""
    text = html.unescape(_TAG_RE.sub("", _TOKEN_RE.sub("", translated)))
    return re.sub(r" {2,}", " ", text).strip()


def restore_html(translated: str, tags: list[str]) -> str:
    """Перевод с вернувшимися тегами, а при любом расхождении простой текст."""
    if tags:
        out = unmask_html(translated, tags)
        if out is not None:
            return out
    return drop_markers(translated)
