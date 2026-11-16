"""Единая точка чтения векторов: только services/embeddings.py знает таблицу векторов и косинусный поиск.
Обход (прямой запрос к EntityEmbedding из другого модуля) означает риск сравнить векторы разных моделей —
после смены модели поиск давал бы мусор без единой ошибки."""
import ast
import pathlib

APP = pathlib.Path(__file__).resolve().parents[1] / "app"
# contradiction_recheck читает таблицу только как индекс сущностей (возраст записи, last_checked_at),
# векторы не сравнивает — модель ему безразлична.
# entity_registry.py держит EntityEmbedding только как значение в POLYMORPHIC_CHILD_MODELS —
# generic DELETE по entity_type/entity_id при удалении родителя (см. event_log.py), колонки
# embedding/embedding_model не читает и не сравнивает, инвариант "не смешивать модели" не задевает.
ALLOWED_TABLE_ACCESS = {"services/embeddings.py", "models/entities.py", "services/contradiction_recheck.py", "core/entity_registry.py"}


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


def test_only_the_read_point_touches_the_vector_table():
    offenders = [rel for rel, tree in _trees() if rel not in ALLOWED_TABLE_ACCESS and _mentions(tree, "EntityEmbedding")]
    assert offenders == []


def test_cosine_search_lives_only_in_embeddings_module():
    offenders = [rel for rel, tree in _trees() if rel != "services/embeddings.py" and _mentions(tree, "cosine_distance")]
    assert offenders == []


def test_similarity_queries_always_filter_by_current_model():
    src = (APP / "services" / "embeddings.py").read_text(encoding="utf-8")
    fn = next(n for n in ast.walk(ast.parse(src)) if isinstance(n, ast.FunctionDef) and n.name == "similar_query")
    assert any(isinstance(n, ast.Attribute) and n.attr == "embedding_model" for n in ast.walk(fn))
