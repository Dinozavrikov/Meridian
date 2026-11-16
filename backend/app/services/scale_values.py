"""Запись значения шкалы у записи + событие журнала. ЕДИНАЯ точка: PUT /scales/values и откат.

ScaleValue — не «сущность» (составной ключ без id): before_flush-листенер event_log его не видит,
поэтому событие updated пишется здесь явно, в том же формате, что у колонок:
meta.changed_fields = {"scale:<scale_id>": {"old": ..., "new": ...}}. Префикс «scale:» вне
пространства имён колонок: id встроенной шкалы ("maturity") иначе совпал бы с колонкой
Hypothesis.maturity, и откат одного трогал бы другое.
reverts_event_id — событие порождено откатом указанного события (как у колонок, см.
event_log._updated_meta): UI отличает откат от обычной правки."""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.events import emit_event
from app.models.entities import ScaleValue

SCALE_FIELD_PREFIX = "scale:"


async def set_scale_value(db: AsyncSession, *, user_id: int, obj, entity_type: str,
                          scale_id: str, value: float | None,
                          reverts_event_id: int | None = None) -> bool:
    """Ставит значение шкалы (value=None — сбрасывает: строка удаляется). Не коммитит.
    Событие пишется только при реальном изменении. Возвращает, изменилось ли значение.
    LookupError — запись удалена или не найдена: значение шкалы мёртвой записи не пишем."""
    # Блокировка строки записи (та же, что берёт откат): иначе параллельная правка слайдера
    # проскочила бы между проверкой конфликта и записью отката. Только ЖИВАЯ запись: удалённая
    # между проверкой доступа и этим местом значения шкалы получать не должна.
    model = type(obj)
    locked = (await db.execute(
        select(model.id).where(model.id == obj.id, model.deleted_at.is_(None)).with_for_update()
    )).scalar_one_or_none()
    if locked is None:
        raise LookupError("запись удалена или не найдена")

    row = (await db.execute(
        select(ScaleValue).where(
            ScaleValue.user_id == user_id,
            ScaleValue.entity_type == entity_type,
            ScaleValue.entity_id == obj.id,
            ScaleValue.scale_id == scale_id,
        )
    )).scalar_one_or_none()
    old = row.value if row is not None else None
    if old == value:
        return False

    if value is None:
        await db.delete(row)
    elif row is None:
        db.add(ScaleValue(user_id=user_id, entity_type=entity_type, entity_id=obj.id,
                          scale_id=scale_id, value=value))
    else:
        row.value = value

    meta: dict = {"changed_fields": {f"{SCALE_FIELD_PREFIX}{scale_id}": {"old": old, "new": value}}}
    if reverts_event_id is not None:
        meta["reverts_event_id"] = reverts_event_id
    await emit_event(
        db, type="updated", actor_id=user_id, entity_type=entity_type, entity_id=obj.id,
        lab_id=obj.lab_id, visibility=obj.visibility, meta=meta,
    )
    return True
