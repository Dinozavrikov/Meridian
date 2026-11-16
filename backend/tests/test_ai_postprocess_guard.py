"""AI-вызовы (embed/classify_fact_or_interpretation/upsert_entity_embedding) должны
жить ТОЛЬКО в services/entity_postprocess.py, вызываемом фоном через BackgroundTasks —
не синхронно в теле create/update роутов. Регрессия на баг от 27.09: create_obs/update_obs
делали 2 последовательных синхронных похода в Ollama, держа пользователя на десятки секунд.
"""
import ast
import pathlib

APP = pathlib.Path(__file__).resolve().parents[1] / "app"

ROUTE_FILES = {
    "api/v1/observations.py",
    "api/v1/hypotheses.py",
    "api/v1/predictions.py",
    "api/v1/worldview.py",
    "api/v1/questions.py",
}
FORBIDDEN_NAMES = {"upsert_entity_embedding", "classify_fact_or_interpretation"}


def _trees():
    for path in sorted(APP.rglob("*.py")):
        yield path.relative_to(APP).as_posix(), ast.parse(path.read_text(encoding="utf-8"))


def _mentions(tree, name):
    for n in ast.walk(tree):
        if isinstance(n, ast.Name) and n.id == name:
            return True
        if isinstance(n, ast.Attribute) and n.attr == name:
            return True
        if isinstance(n, (ast.ImportFrom, ast.Import)) and any((a.asname or a.name) == name for a in n.names):
            return True
    return False


def test_entity_routes_never_call_ai_synchronously():
    offenders = []
    for rel, tree in _trees():
        if rel not in ROUTE_FILES:
            continue
        for name in FORBIDDEN_NAMES:
            if _mentions(tree, name):
                offenders.append(f"{rel}: {name}")
    assert offenders == [], f"Синхронный AI-вызов в роуте (должен быть в фоне, см. entity_postprocess.py): {offenders}"


def test_entity_routes_use_background_postprocessing():
    """Каждый из 5 роут-файлов обязан импортировать фоновую пост-обработку —
    иначе патч мог случайно снести вызов вообще, а не перенести в фон."""
    offenders = [
        rel for rel, tree in _trees()
        if rel in ROUTE_FILES and not _mentions(tree, "run_entity_postprocessing_background")
    ]
    assert offenders == [], f"Роут не использует фоновую пост-обработку: {offenders}"
