"""Упоминания записей в тексте: ссылки <a href="meridian://{тип}/{id}"> из rich-редактора.
Тот же формат разбирает фронт (frontend/lib/entity-routes.ts::parseEntityHref); правила держим одинаковыми:
тип только строчными латинскими, id только цифры 0-9 (\\d в Python принял бы и чужие цифры).
Функция чистая: БД не трогает. Мусор (чужой тип, огромный id, лишние части адреса) молча игнорируется:
сохранение текста не должно падать из-за упоминаний ни при каком вводе."""
import re

from bs4 import BeautifulSoup

from app.core.entity_registry import ENTITY_MODELS

# Источники и цели упоминаний: 6 базовых типов + результат лаборатории. Из реестра, а не копией списка.
MENTION_TYPES = frozenset(ENTITY_MODELS) | {"result"}
INT32_MAX = 2 ** 31 - 1               # id в колонках integer; больше даёт DataError на вставке
MAX_MENTIONS_PER_FIELD = 200          # защита от текста с тысячами ссылок

_HREF = re.compile(r"meridian://([a-z]+)/([0-9]{1,10})")


def extract_mentions(html: str | None) -> list[tuple[str, int]]:
    """[(тип, id)] в порядке первого появления, без повторов, не больше MAX_MENTIONS_PER_FIELD."""
    if not html or "<a" not in html.lower():
        return []
    found: list[tuple[str, int]] = []
    seen: set[tuple[str, int]] = set()
    for a in BeautifulSoup(html, "html.parser").find_all("a", href=True):
        m = _HREF.fullmatch(str(a["href"]).strip())
        if not m:
            continue
        etype, eid = m.group(1), int(m.group(2))
        if etype not in MENTION_TYPES or not 1 <= eid <= INT32_MAX or (etype, eid) in seen:
            continue
        seen.add((etype, eid))
        found.append((etype, eid))
        if len(found) >= MAX_MENTIONS_PER_FIELD:
            break
    return found
