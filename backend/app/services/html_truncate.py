"""Обрезка HTML по видимому тексту. Срез строки по символам разметки рвет теги: ссылка
<a href="meridian://..."> теряется целиком, а длинный href съедает бюджет превью.
Здесь считаются только символы текста, обрезанные теги закрываются, все после предела
отбрасывается вместе с картинками и пустыми обертками. Голый текст (легаси без тегов)
режется как раньше. Результат все равно проходит очистку на фронтенде."""
import re

from bs4 import BeautifulSoup, NavigableString

_TAG_RE = re.compile(r"<[a-zA-Z/!]")


def _drop_after(node) -> None:
    cur = node
    while cur is not None and cur.parent is not None:
        for sib in list(cur.next_siblings):
            sib.extract()
        cur = cur.parent


def truncate_html(raw: str | None, limit: int) -> str:
    raw = raw or ""
    if not _TAG_RE.search(raw):
        return raw[:limit]
    soup = BeautifulSoup(raw, "html.parser")
    left = limit
    changed = False
    for node in list(soup.find_all(string=True)):
        if type(node) is not NavigableString:  # комментарии, script, style: не видимый текст
            node.extract()
            changed = True
            continue
        if len(node) < left:
            left -= len(node)
            continue
        if len(node) > left:
            new = NavigableString(str(node)[:left])
            node.replace_with(new)
            node = new
        _drop_after(node)
        changed = True
        break
    return str(soup) if changed else raw
