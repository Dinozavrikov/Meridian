"""Снимок лабы должен покрывать ВСЕ таблицы, где живёт содержимое лабы. Тест обходит схему БД и требует по
каждой таблице, связанной с лабой или с 6 базовыми типами, осознанного решения: в снимке (CAPTURED) или
исключена с причиной (EXCLUDED). Новая таблица без решения роняет тест — иначе она тихо не попадёт в
«полную копию». Что снимок РЕАЛЬНО копирует из captured-таблиц, проверяют поведенческие тесты в
test_lab_checkpoints*.py; этот тест держит только полноту решений."""
import app.main  # noqa: F401  (импорт регистрирует все модели в Base.metadata)
from app.core.entity_registry import ENTITY_MODELS
from app.db.base import Base

ROOT_TABLES = {m.__tablename__ for m in ENTITY_MODELS.values()} | {"labs", "results"}

CAPTURED: dict[str, str] = {  # таблица -> вид элемента снимка (lab_checkpoints.collect_items)
    "labs": "lab", "results": "result", "result_source_links": "result_source_link", "links": "link",
    "entity_hypotheses": "entity_hypothesis", "entity_comments": "comment", "entity_images": "image",
    "entity_attachments": "attachment", "source_documents": "source", "entity_stages": "stage",
    "entity_tags": "tag", "tags": "tag", "scale_values": "scale_value", "scale_defs": "scale_def",
    **{m.__tablename__: "entity" for m in ENTITY_MODELS.values()},
    "lab_members": "lab_member", "task_scales": "task_scale", "task_scale_hypotheses": "task_scale_hypothesis",
    "hyp_status_history": "hyp_status_history", "hypothesis_posts": "post", "observation_posts": "post",
    "post_comments": "post_comment",
}
EXCLUDED: dict[str, str] = {
    "lab_checkpoints": "сам снимок",
    "lab_checkpoint_items": "сам снимок",
    "user_comment_seen": "личное состояние «прочитано», не содержимое",
    "entity_attachment_versions": "история версий вложений (решение этапа 1)",
    "content_translations": "кэш машинного перевода — производное",
    "entity_embeddings": "векторы — производное, пересчитываются",
    "events": "журнал ленты/событий: действия, не содержимое лабы",
    "lab_join_requests": "заявки людей с личными сообщениями",
    "maturity_suggestions": "предложения по формуле — производное",
    "prediction_calibration_residue": "остаток калибровки без текста — служебное",
    "prediction_reflection_insights": "личные диалоги рефлексии",
    "prediction_reflections": "личные диалоги рефлексии (raw_dialogue_text)",
    "question_answer_feedback": "личный лог подсказок ИИ",
    "reposts": "происхождение копии; сама копия записи входит в снимок",
    "record_shares": "согласие владельца на открытие записи через связь: право доступа, а не содержимое; при восстановлении снимка согласие нельзя возвращать молча",
    "result_edit_suggestions": "процесс предложений правок; принятое уже в body результата",
    "task_expectations": "личные ожидания пользователя с уверенностью",
}


def _related(t) -> bool:
    refs = {fk.column.table.name for fk in t.foreign_keys}
    cols = set(t.c.keys())
    decided = set(CAPTURED) | set(EXCLUDED)   # ребёнок решённой таблицы тоже требует решения (post_comments -> hypothesis_posts)
    return (bool(refs & (ROOT_TABLES | decided)) or "lab_id" in cols or {"entity_type", "entity_id"} <= cols
            or {"parent_type", "parent_id"} <= cols or {"from_type", "from_id"} <= cols)


def _describe(t) -> str:
    refs = sorted({fk.column.table.name for fk in t.foreign_keys})
    return f"  {t.name}: FK на {refs}; колонки {sorted(t.c.keys())}"


def test_every_lab_related_table_is_decided():
    assert not (set(CAPTURED) & set(EXCLUDED)), "таблица одновременно в снимке и в исключениях"
    tables = Base.metadata.tables
    undecided = sorted(n for n, t in tables.items() if _related(t) and n not in set(CAPTURED) | set(EXCLUDED))
    assert not undecided, "Нет решения (снимок / исключение с причиной) для таблиц:\n" + "\n".join(
        _describe(tables[n]) for n in undecided)


def test_decisions_name_only_existing_tables():
    stale = sorted((set(CAPTURED) | set(EXCLUDED)) - set(Base.metadata.tables))
    assert not stale, f"решения для несуществующих таблиц (переименованы?): {stale}"


def test_heuristic_sees_children_of_decided_tables():
    """Регрессия: post_comments не ссылается на корневые таблицы, но ссылается на решённую (hypothesis_posts) —
    раньше такая таблица оставалась невидимой для проверки полноты."""
    assert _related(Base.metadata.tables["post_comments"])
