"""Охрана: каждая функция, которая может создать связь (Link / EntityHypothesis / Prediction.hypothesis_id), обязана вызывать
require_publication_consent и grant_publication (согласие владельца на открытие записи лаборатории) либо стоять в EXEMPT
с причиной. Читает исходники (ast): новая точка входа без решения роняет тест."""
import ast
import pathlib

APP = pathlib.Path(__file__).resolve().parent.parent / "app"

GATED = {
    ("api/v1/graph.py", "add_link"), ("api/v1/tasks.py", "add_task_hyp"), ("api/v1/questions.py", "add_question_hyp"),
    ("api/v1/predictions.py", "create_pred"), ("api/v1/predictions.py", "update_pred"),
    ("services/link_events.py", "undo_link_event"), ("services/link_events.py", "_undo_competing"),
    ("services/link_events.py", "_undo_field"),
}
EXEMPT: dict[tuple[str, str], str] = {
    ("api/v1/auth.py", "register"): "онбординг-прогнозы нового аккаунта: лабораторий нет, открывать нечего",
    ("services/entity_hypotheses.py", "add_hyp"): "единственный вызов (add_question_hyp) уже под согласием",
    ("api/v1/hypotheses.py", "create_hyp"): "автопривязка к цели лаборатории: обе стороны уже в лаборатории; без строки согласия ничего не открывается",
    ("api/v1/labs.py", "attach_proposed_hypothesis"): "то же: гипотеза уже с lab_id этой лаборатории; без строки согласия ничего не открывается",
}


def _all_functions():
    for path in sorted(APP.rglob("*.py")):
        rel = path.relative_to(APP).as_posix()
        if rel.startswith("models/"):
            continue
        src = path.read_text()
        for fn in ast.walk(ast.parse(src)):
            if isinstance(fn, (ast.FunctionDef, ast.AsyncFunctionDef)):
                yield (rel, fn.name), ast.get_source_segment(src, fn) or ""


def _publishing_functions():
    for path in sorted(APP.rglob("*.py")):
        rel = path.relative_to(APP).as_posix()
        if rel.startswith("models/"):
            continue
        src = path.read_text()
        for fn in ast.walk(ast.parse(src)):
            if not isinstance(fn, (ast.FunctionDef, ast.AsyncFunctionDef)):
                continue
            hit = False
            for node in ast.walk(fn):
                if isinstance(node, ast.Call):
                    name = getattr(node.func, "id", None)
                    hit |= name in ("Link", "EntityHypothesis") or (name == "Prediction" and any(k.arg == "hypothesis_id" for k in node.keywords))
                elif isinstance(node, ast.Assign):
                    hit |= any(isinstance(t, ast.Attribute) and t.attr == "hypothesis_id" for t in node.targets) \
                        and not (isinstance(node.value, ast.Constant) and node.value.value is None)
            if hit:
                yield (rel, fn.name), ast.get_source_segment(src, fn) or ""


def test_every_link_creating_function_is_gated_or_exempt():
    found = dict(_publishing_functions())
    undecided = sorted(k for k in found if k not in GATED and k not in EXEMPT)
    assert not undecided, "функции создают связь без согласия и без записи в EXEMPT: " + ", ".join(f"{f}:{n}" for f, n in undecided)
    every = dict(_all_functions())   # GATED проверяется по всем функциям: add_question_hyp сам не создаёт связь, а делегирует
    ungated = sorted(k for k in GATED if k in every and not ("require_publication_consent" in every[k] and "grant_publication" in every[k]))
    assert not ungated, f"нет вызова require_publication_consent/grant_publication: {ungated}"
    stale = sorted((GATED | set(EXEMPT)) - set(every))
    assert not stale, f"решения для функций, которых больше нет: {stale}"
