"""Канонический JSON и хеши снимков лабы (формат v1). Чистые функции без БД: на них строятся
проверка целостности и, позже, fork/merge — алгоритм не должен зависеть от того, как строка
хранится в JSONB.

Канонический JSON: объекты — ключи по возрастанию кодовой точки Unicode, без пробелов; строки —
как json.dumps(ensure_ascii=False); числа — десятичная запись без экспоненты и без хвостовых
нулей (7.0 и 7 — одно и то же, -0 -> 0): JSONB хранит числа как numeric и возвращает 1e22 как
целое, поэтому «сырая» запись float не воспроизводима после круга через базу. NaN/Infinity и
нестроковые ключи — ошибка.

item_hash  = sha256(canonical({"kind","key","data","blob"}))      blob — sha256 файла или null
tree_hash  = sha256("\\n".join(sorted(f"{object_key}\\t{item_hash}")))
commit_hash = sha256(canonical({"v","lab_id","parent","tree","created_at","title"}))
  parent — commit_hash предыдущего снимка (или null); created_at — UTC, "YYYY-MM-DDTHH:MM:SS.ffffffZ".
created_by в хеш НЕ входит: автор может быть удалён (SET NULL), хеш обязан остаться воспроизводимым."""
import hashlib
import json
from datetime import datetime, timezone
from decimal import Decimal
from typing import Iterable

SCHEMA_VERSION = 1


def _number(v: float) -> str:
    if v != v or v in (float("inf"), float("-inf")):
        raise ValueError("NaN/Infinity в снимке недопустимы")
    d = Decimal(repr(v)).normalize()
    return "0" if d == 0 else format(d, "f")


def canonical_json(value) -> str:
    if value is None:
        return "null"
    if value is True:
        return "true"
    if value is False:
        return "false"
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        return _number(value)
    if isinstance(value, str):
        return json.dumps(value, ensure_ascii=False)
    if isinstance(value, (list, tuple)):
        return "[" + ",".join(canonical_json(v) for v in value) + "]"
    if isinstance(value, dict):
        if not all(isinstance(k, str) for k in value):
            raise TypeError("ключи объекта в снимке должны быть строками")
        return "{" + ",".join(json.dumps(k, ensure_ascii=False) + ":" + canonical_json(value[k]) for k in sorted(value)) + "}"
    raise TypeError(f"тип {type(value).__name__} не сериализуется в канонический JSON")


def sha256_hex(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def item_hash(kind: str, object_key: str, data: dict, blob_sha256: str | None) -> str:
    return sha256_hex(canonical_json({"kind": kind, "key": object_key, "data": data, "blob": blob_sha256}))


def tree_hash(entries: Iterable[tuple[str, str]]) -> str:
    return sha256_hex("\n".join(f"{key}\t{h}" for key, h in sorted(entries)))


def format_ts(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def commit_hash(*, lab_id: int, parent_commit_hash: str | None, tree: str, created_at: datetime, title: str | None) -> str:
    return sha256_hex(canonical_json({
        "v": SCHEMA_VERSION, "lab_id": lab_id, "parent": parent_commit_hash, "tree": tree,
        "created_at": format_ts(created_at), "title": title,
    }))
