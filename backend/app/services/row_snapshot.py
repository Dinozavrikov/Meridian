"""Снимок строки ORM в JSON-совместимый dict: ЕДИНАЯ реализация для event_log (событие deleted) и
снимков лабы (lab_checkpoints) — не заводить третью копию.

ТОЛЬКО колонки через mapper.column_attrs — НЕ __dict__ (там _sa_instance_state, служебные
атрибуты сессии и любые приписанные объекту поля) и НЕ relationships (обращение к ним может
вызвать lazy-load: посреди flush или в async-контексте это недопустимо)."""
from decimal import Decimal
from uuid import UUID

from sqlalchemy import inspect


def json_safe(value):
    """Приводит значение колонки к JSON-совместимому виду для Event.meta / снимков (JSONB).
    json.dumps не умеет datetime/date/Decimal/UUID — раньше конвертацию делала только ветка
    deleted, ветка updated падала на первой же datetime-колонке (например
    Prediction.expected_check_date), откатывая весь flush."""
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    if hasattr(value, "isoformat"):
        return value.isoformat()
    if isinstance(value, (Decimal, UUID)):
        return str(value)
    if isinstance(value, (list, tuple)):
        return [json_safe(v) for v in value]
    if isinstance(value, dict):
        return {str(k): json_safe(v) for k, v in value.items()}
    return str(value)


def serialize_row(obj) -> dict:
    return {attr.key: json_safe(getattr(obj, attr.key)) for attr in inspect(obj).mapper.column_attrs}
