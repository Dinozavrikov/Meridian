"""Плоский обход маршрутов приложения для тестов.

В новых fastapi include_router не разворачивает роуты в app.routes: там лежат контейнеры
_IncludedRouter. Раньше тесты искали роуты прямым циклом по app.routes, и охранные тесты
молча проверяли пустоту. Единственное место, знающее про устройство контейнеров, - этот файл.
Хелпер возвращает объекты с .path (с префиксом), .methods, .endpoint, .name.
"""
from fastapi.routing import _IncludedRouter

from app.main import app

MIN_ROUTES = 100  # меньше - значит обход сломался, а не проект похудел


def iter_api_routes():
    def walk(routes):
        for r in routes:
            if isinstance(r, _IncludedRouter):
                yield from r.effective_route_contexts()
            else:
                yield r

    found = [
        r for r in walk(app.routes)
        if getattr(r, "endpoint", None) is not None and getattr(r, "methods", None)
        and getattr(r, "include_in_schema", True)
    ]
    if len(found) < MIN_ROUTES:
        raise RuntimeError(f"обход маршрутов нашел только {len(found)}: устройство fastapi изменилось?")
    return found
