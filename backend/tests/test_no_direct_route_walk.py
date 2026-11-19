"""Тесты не обходят app.routes напрямую: в новых fastapi там контейнеры _IncludedRouter,
и такой обход молча видит почти пустоту (охранные тесты проходят вхолостую).
Единственное разрешенное место - tests/route_utils.py."""
import ast
import pathlib

TESTS = pathlib.Path(__file__).parent
ALLOWED = {"route_utils.py"}


def direct_walks(source: str):
    """Номера строк, где код читает .routes у объекта по имени app (app.routes, pkg.app.routes)."""
    lines = []
    for n in ast.walk(ast.parse(source)):
        if isinstance(n, ast.Attribute) and n.attr == "routes":
            v = n.value
            name = v.id if isinstance(v, ast.Name) else getattr(v, "attr", None)
            if name == "app":
                lines.append(n.lineno)
    return lines


def test_detector_finds_real_walks_and_ignores_text():
    assert direct_walks("for r in app.routes:\n    pass") == [1]
    assert direct_walks("import app.main\nx = app.main.app.routes") == [2]
    assert direct_walks('"""из app.routes"""\n# app.routes\nx = 1') == []
    assert direct_walks("app.router.routes.remove(r)") == []


def test_no_test_walks_app_routes_directly():
    bad = []
    for f in sorted(TESTS.rglob("*.py")):
        if f.name in ALLOWED:
            continue
        for line in direct_walks(f.read_text()):
            bad.append(f"{f.relative_to(TESTS)}:{line}")
    assert not bad, f"используй tests.route_utils.iter_api_routes вместо app.routes: {bad}"
