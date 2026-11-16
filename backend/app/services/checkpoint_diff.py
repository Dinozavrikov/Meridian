"""Дифф двух снимков лабы: чистые функции над элементами снимка (без БД).

Записи (kind entity/trashed) сопоставляются по (entity_type, entity_id), а не по object_key, потому что
живая запись и «отметка корзины» — два состояния ОДНОЙ записи:
  отсутствует -> живая: added            живая -> отсутствует: removed
  живая -> в корзине:   trashed          в корзине -> живая:   restored
  в корзине -> отсутствует: removed      отсутствует -> в корзине: trashed
  живая -> живая: changed (если поля различаются)
«removed» не различает «удалена навсегда» и «вынесена из лабы»: по двум снимкам это не узнать.
Остальные виды сопоставляются по object_key: added / removed / changed. Дети (комментарии, теги, файлы...)
записи, у которой менялся жизненный цикл (added/removed/trashed/restored), отдельными строками не
показываются: это следует из строки самой записи. updated_at в изменениях не показывается (производное)."""
import re

IGNORED_FIELDS = frozenset({"updated_at"})
# Колонки, добавленные после первых снимков: если ключа в старом снимке нет, это значение по умолчанию из БД,
# а не «изменение» (иначе каждая конкурирующая гипотеза старого снимка показывалась бы изменённой).
ADDED_LATER_DEFAULTS = {"role": "alternative", "stance": "связано"}
RECORD_KINDS = frozenset({"entity", "trashed"})
CHILD_KINDS = frozenset({"comment", "tag", "image", "attachment", "source", "stage", "scale_value", "result_source_link",
                        "lab_member", "task_scale", "task_scale_hypothesis", "hyp_status_history", "post",
                        "post_comment"})
LIFECYCLE = frozenset({"added", "removed", "trashed", "restored"})
_LABEL_FIELD = {"observation": "title", "hypothesis": "name", "prediction": "title",
                "worldview": "belief", "question": "title", "task": "name"}
_TRANSITIONS = {
    ("absent", "live"): "added", ("live", "absent"): "removed", ("live", "trashed"): "trashed",
    ("trashed", "live"): "restored", ("trashed", "absent"): "removed", ("absent", "trashed"): "trashed",
}
_TAGS = re.compile(r"<[^>]+>")


def _plain(value, limit: int = 120) -> str | None:
    text = re.sub(r"\s+", " ", _TAGS.sub(" ", str(value))).strip()
    return text[:limit] if text else None


def _label(entity_type: str, *datas) -> str | None:
    field = _LABEL_FIELD.get(entity_type)
    if field:
        for d in datas:
            if d and d.get(field):
                label = _plain(d[field])
                if label:
                    return label
    return None


def changed_fields(old: dict, new: dict) -> dict:
    out = {}
    for k in sorted(set(old) | set(new)):
        if k in IGNORED_FIELDS:
            continue
        if k == "created_at" and (k not in old or k not in new):
            continue  # колонка появилась позже первых снимков (links.created_at): отсутствие — не изменение
        ov = old.get(k, ADDED_LATER_DEFAULTS.get(k)) if k not in old else old[k]
        nv = new.get(k, ADDED_LATER_DEFAULTS.get(k)) if k not in new else new[k]
        if ov != nv:
            out[k] = {"old": ov, "new": nv}
    return out


def _states(items) -> dict:
    state = {}
    for it in items:
        if it.kind == "trashed":
            state[(it.entity_type, it.entity_id)] = ("trashed", it)
    for it in items:
        if it.kind == "entity":
            state[(it.entity_type, it.entity_id)] = ("live", it)
    return state


def _record_changes(a, b) -> list[dict]:
    sa, sb = _states(a), _states(b)
    out = []
    for ident in sorted(set(sa) | set(sb)):
        old, new = sa.get(ident), sb.get(ident)
        o = old[0] if old else "absent"
        n = new[0] if new else "absent"
        old_data = old[1].snapshot_data if old and o == "live" else None
        new_data = new[1].snapshot_data if new and n == "live" else None
        changes = None
        if o == "live" and n == "live":
            changes = changed_fields(old_data, new_data)
            if not changes:
                continue
            status = "changed"
        else:
            status = _TRANSITIONS.get((o, n))
            if status is None:
                continue
        et, eid = ident
        rec = {"kind": "entity", "entity_type": et, "entity_id": eid, "object_key": f"entity:{et}:{eid}",
               "status": status, "from_state": o, "to_state": n, "label": _label(et, new_data, old_data)}
        if changes is not None:
            rec["changed_fields"] = changes
        out.append(rec)
    return out


def _keyed(items) -> dict:
    return {i.object_key: i for i in items if i.kind not in RECORD_KINDS}


def _keyed_record(key: str, old, new) -> dict | None:
    item = new or old
    base = {"kind": item.kind, "entity_type": item.entity_type, "entity_id": item.entity_id, "object_key": key}
    if old is None:
        return {**base, "status": "added", "data": new.snapshot_data}
    if new is None:
        return {**base, "status": "removed", "data": old.snapshot_data}
    changes = changed_fields(old.snapshot_data, new.snapshot_data)
    blob_changed = old.blob_sha256 != new.blob_sha256
    if not changes and not blob_changed:
        return None
    rec = {**base, "status": "changed", "changed_fields": changes}
    if blob_changed:
        rec["blob"] = {"old": old.blob_sha256, "new": new.blob_sha256}
    return rec


def diff_items(a, b) -> list[dict]:
    """a — «было», b — «стало»: оба — элементы снимков (kind, object_key, entity_type, entity_id,
    snapshot_data, blob_sha256)."""
    records = _record_changes(a, b)
    skip = {(r["entity_type"], r["entity_id"]) for r in records if r["status"] in LIFECYCLE}
    ka, kb = _keyed(a), _keyed(b)
    keyed: list[dict] = []
    for children_phase in (False, True):   # сначала самостоятельные виды: из них узнаём, какие результаты появились/исчезли
        for key in sorted(set(ka) | set(kb)):
            old, new = ka.get(key), kb.get(key)
            item = new or old
            if (item.kind in CHILD_KINDS) != children_phase:
                continue
            if children_phase and (item.entity_type, item.entity_id) in skip:
                continue
            rec = _keyed_record(key, old, new)
            if rec is None:
                continue
            keyed.append(rec)
            if item.kind == "result" and rec["status"] in ("added", "removed"):
                skip.add(("result", item.entity_id))
    keyed.sort(key=lambda r: (r["kind"], r["object_key"]))
    return records + keyed
