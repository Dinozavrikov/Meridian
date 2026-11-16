"""Что видит ПОСТОРОННИЙ (не участник лабы) в опубликованном снимке.

Принцип — БЕЛЫЙ СПИСОК: поле, которого нет в PUBLIC_FIELDS, постороннему не отдаётся никогда. Новая
колонка модели по умолчанию скрыта, а тест test_every_model_column_is_decided требует занести её
в PUBLIC_FIELDS или в HIDDEN_FIELDS с причиной: решение принимается осознанно, как allowlist откатов
(services/undo.py). Виды HIDDEN_KINDS скрыты целиком. Люди (user_id, имя автора, ники) не отдаются
нигде; полная копия остаётся в базе и видна участникам.

Ограничение (честно): commit_hash/tree_hash считаются по ПОЛНЫМ данным, поэтому посторонний не может
пересчитать их по урезанному виду — для него хеш идентификатор (его можно заверить во внешней
системе), а не проверяемая гарантия. Проверяемость урезанного вида — задача формата v2
(schema_version это допускает: снимки v1 остаются проверяемыми по правилам v1)."""
from dataclasses import dataclass


def _f(names: str) -> frozenset[str]:
    return frozenset(names.split())


PUBLIC_FIELDS: dict[str, frozenset[str]] = {
    "lab": _f("id name slug description goal_type goal_id created_at updated_at"),
    "observation": _f("id date title slug text status importance created_at updated_at"),
    "hypothesis": _f("id name slug description falsification_criteria date_created status stability research_load "
                     "maturity risk created_at updated_at"),
    "prediction": _f("id title slug text date_created expected_check_date hypothesis_id status confidence "
                     "result_notes confirms_hypothesis_if_true created_at updated_at"),
    "worldview": _f("id date belief slug status confirming_data refuting_data confidence created_at updated_at"),
    "question": _f("id title slug text status priority importance answer date_created created_at updated_at"),
    "task": _f("id name slug description status progress created_at updated_at"),
    "result": _f("id title slug body created_at updated_at"),
    "result_source_link": _f("id result_id source_document_id created_at updated_at"),
    "link": _f("id from_type from_id to_type to_id link_type created_at"),
    "entity_hypothesis": _f("parent_type parent_id hypothesis_id role stance"),
    "source": _f("id entity_type entity_id url title summary verdict_reason source_weight source_type verdict "
                 "weight_reason created_at updated_at"),
    "stage": _f("id entity_type entity_id current_stage created_at updated_at"),
    "scale_def": _f("id entity_type name description min_val max_val step group_by color levels created_at updated_at"),
    "scale_value": _f("entity_type entity_id scale_id value"),
    "tag": _f("entity_type entity_id name"),   # синтетический элемент (см. lab_checkpoints.collect_items), не строка таблицы
    "task_scale": _f("id task_id name description min_val max_val current_val value_labels auto_formula unit"),
    "task_scale_hypothesis": _f("task_scale_id hypothesis_id"),
    "hyp_status_history": _f("id hypothesis_id status changed_at"),
}

_P = "персональный идентификатор"
_S = "служебное поле"
_D = "производное, пересчитывается"
_NULL = "в снимке всегда NULL"

HIDDEN_FIELDS: dict[str, dict[str, str]] = {
    "lab": {"owner_id": _P, "is_public": "текущее состояние лабы, не историческое", "open_join": _S},
    "observation": {"user_id": _P, "author": "имя автора — свободный текст, может быть настоящим именем",
                    "visibility": _S, "lab_id": _S, "content_kind": _S, "deleted_at": _NULL},
    "hypothesis": {"user_id": _P, "evidence_diversity_cache": _D, "diversity_computed_at": _D, "evidence_signal": _D,
                   "visibility": _S, "lab_id": _S, "is_onboarding": _S, "deleted_at": _NULL},
    "prediction": {"user_id": _P, "visibility": _S, "lab_id": _S, "reminder_sent": _S, "is_onboarding": _S, "deleted_at": _NULL,
                   "signal_contribution": _D, "lab_signal_contribution": _D},
    "worldview": {"user_id": _P, "visibility": _S, "lab_id": _S, "deleted_at": _NULL},
    "question": {"user_id": _P, "visibility": _S, "lab_id": _S, "deleted_at": _NULL},
    "task": {"user_id": _P, "visibility": _S, "lab_id": _S, "deleted_at": _NULL},
    "result": {"user_id": _P, "lab_id": _S, "visibility": _S, "is_published": "собственный переключатель результата, не относится к снимку"},
    "result_source_link": {},
    "link": {"user_id": _P},
    "entity_hypothesis": {},
    "source": {"user_id": _P, "verdict_by_user": _S, "status": "служебный статус обработки", "error_msg": _S},
    "stage": {"user_id": _P},
    "scale_def": {"user_id": _P, "builtin_key": _S},
    "scale_value": {"user_id": _P},
    "tag": {"tag_id": "теги у каждого пользователя свои — идентификатор персональный", "tag_user_id": _P},
    "task_scale": {},
    "task_scale_hypothesis": {},
    "hyp_status_history": {},
}

HIDDEN_KINDS: dict[str, str] = {
    "comment": "слова людей: автор, ответы, личные пометки — только участникам",
    "image": "файл и описание могут содержать личное; посторонним файлы не отдаются",
    "attachment": "то же, включая inline-текст кода и документов",
    "trashed": "отметки корзины — служебное; нужны участникам для диффа",
    "lab_member": "люди: состав лабы и роли — только участникам",
    "post": "слова людей: посты ленты — только участникам",
    "post_comment": "слова людей: комментарии к постам — только участникам",
}


@dataclass(frozen=True)
class PublicRow:
    kind: str
    entity_type: str
    entity_id: int | None
    object_key: str
    snapshot_data: dict
    blob_sha256: str | None = None
    blob_size: int | None = None


def schema_of(kind: str, entity_type: str) -> str | None:
    """Имя схемы белого списка для элемента снимка; None — элемент постороннему не показывается."""
    if kind in HIDDEN_KINDS:
        return None
    schema = entity_type if kind == "entity" else kind
    return schema if schema in PUBLIC_FIELDS else None


def redact_data(schema: str, data: dict) -> dict:
    allowed = PUBLIC_FIELDS[schema]
    return {k: v for k, v in data.items() if k in allowed}


def public_rows(rows) -> list[PublicRow]:
    out = []
    for it in rows:
        schema = schema_of(it.kind, it.entity_type)
        if schema is None:
            continue
        out.append(PublicRow(it.kind, it.entity_type, it.entity_id, it.object_key, redact_data(schema, it.snapshot_data)))
    return out


def redact_diff(records: list[dict]) -> list[dict]:
    """Дифф для постороннего: скрытые виды выбрасываются, в изменениях остаются только публичные поля;
    запись, у которой изменились лишь скрытые поля, не показывается совсем."""
    out = []
    for r in records:
        schema = schema_of(r["kind"], r["entity_type"])
        if schema is None:
            continue
        r = dict(r)
        if "changed_fields" in r:
            allowed = PUBLIC_FIELDS[schema]
            cf = {k: v for k, v in r["changed_fields"].items() if k in allowed}
            if not cf:
                continue
            r["changed_fields"] = cf
        r.pop("blob", None)
        if "data" in r:
            r["data"] = redact_data(schema, r["data"])
        out.append(r)
    return out
