"""ORM-driven event log — before_flush listener на AppSession (см.
app/db/session.py). Дополняет ручной emit_event() (services/events.py,
используется в роутах для created/status_changed/linked/etc.) автоматической
фиксацией update/delete на уровне ORM, чтобы запись в events физически не
могла быть забыта в новом роуте (см. историю: research_tasks/worldview
дважды забывали emit_event вручную).

Механизм — before_flush, не mapper-level after_insert/after_update/after_delete:
- канонiчный паттерн SQLAlchemy для audit-log (examples/versioning/history_meta.py)
- session.new/dirty/deleted доступны ДО физического DELETE/UPDATE — объекты
  ещё не expired/detached, их колоночные атрибуты читаются из памяти
- session.add() внутри before_flush попадает в тот же flush автоматически,
  без риска двойного flush/greenlet-эффектов, которые есть у mapper-events
  при добавлении новых строк из callback'а

created НЕ обрабатывается здесь (session.new) — остаётся ручным emit_event
в роутах, там больше логики (competing_hypothesis и т.п.), дублировать нет
смысла.

status_changed (ручной emit_event в роутах) сознательно НЕ исключается из
ORM-diff по полю status — одна смена статуса даёт ДВА события
(status_changed + updated с полем status в changed_fields). Дублирование
осознанное: цена исключения (усложнение per-модельной логики) выше цены
дублирования (лента фильтрует по типу через FEED_EVENT_TYPES, updated в
неё не попадает вообще).
"""
import os
from decimal import Decimal
from uuid import UUID

from sqlalchemy import event, inspect, select, delete, or_, and_
from sqlalchemy.orm import Session

from app.db.session import AppSession
from app.core.entity_registry import EVENT_LOGGED_MODELS, ENTITY_MODELS, POLYMORPHIC_CHILD_MODELS
from app.models.entities import EntityHypothesis, Event, Link, EntityImage, EntityAttachment, EntityAttachmentVersion, RecordShare, EntityMention
from app.models.user import User
from app.services.image_processing import resolve_image_path
from app.services.attachment_storage import resolve_attachment_path

# Кэш id системного пользователя ДЛЯ SYNC-ПУТИ (fallback ниже) — отдельный
# от app.core.entity_registry.get_system_user_id (async, используется явными
# вызывающими вроде services/prediction_reminders.py, которые ставят
# session.info["actor_id"] заранее в async-контексте). Два кэша для одного
# и того же значения — не два реестра (см. Event Log — Шаг 1, п.2, где это
# было реальной проблемой): здесь дублирование неизбежно, sync-callback
# внутри flush не может позвать await. Оба кэша ищут один и тот же
# username="system" — если он когда-нибудь изменится, менять в обоих местах.
_sync_system_user_id_cache: int | None = None

# Модель -> entity_type строка, обратный маппинг EVENT_LOGGED_MODELS — для
# определения entity_type по типу объекта внутри listener'а.
_MODEL_TO_ENTITY_TYPE = {model: etype for etype, model in EVENT_LOGGED_MODELS.items()}

# Служебные/derived поля, исключаемые из diff при генерации Event(updated) —
# фоновые пересчёты, не смысловые действия пользователя. НЕ единый список на
# все 6 типов: у моделей разные кэш-поля (см. Event Log — Шаг 1, п.3).
# Проверено по факту чтения entities.py на дату 18.09, не предполагалось
# по симметрии с Hypothesis.
_EXCLUDED_FIELDS: dict[str, set[str]] = {
    "observation": {"updated_at", "content_kind"},
    "hypothesis":  {"updated_at", "evidence_diversity_cache", "diversity_computed_at", "evidence_signal"},
    "prediction":  {"updated_at", "reminder_sent", "signal_contribution", "lab_signal_contribution"},
    "worldview":   {"updated_at"},
    "question":    {"updated_at"},
    "task":        {"updated_at"},
    "attachment":  {"updated_at"},
}


from app.services.row_snapshot import json_safe as _json_safe  # единая реализация (снимки лабы берут её же)


def _entity_type_for(obj) -> str | None:
    return _MODEL_TO_ENTITY_TYPE.get(type(obj))


def _resolve_visibility_lab(session, own_entity_type, own_visibility, own_lab_id,
                             parent_type, parent_id) -> tuple[str, int | None]:
    """Для 6 базовых типов (own_entity_type in ENTITY_MODELS) — собственные
    visibility/lab_id объекта, они уже правильные. Для полиморфных детей без
    таких колонок (сейчас единственный случай — attachment, единственный
    non-ENTITY_MODELS тип в EVENT_LOGGED_MODELS) — own_visibility/own_lab_id
    приходят от getattr(obj, ..., default) выше по стеку и ВСЕГДА будут
    default'ом (private/None), т.к. атрибута физически нет на модели: реальные
    значения берём у родителя через его entity_type/entity_id (колонки самого
    attachment, указывающие на владеющую сущность — НЕ путать с entity_type
    Event-строки, это "какой тип объекта изменился", разные вещи). Раньше тут
    молча подставлялся private/None независимо от видимости родителя — тихо
    искажало updated- и deleted-события по всем вложениям."""
    if own_entity_type in ENTITY_MODELS:
        return own_visibility or "private", own_lab_id
    parent_model = ENTITY_MODELS.get(parent_type)
    if parent_model is None:
        return "private", None
    row = session.execute(
        select(parent_model.visibility, parent_model.lab_id).where(parent_model.id == parent_id)
    ).first()
    return (row[0], row[1]) if row else ("private", None)


def _updated_meta(session, entity_type: str, entity_id: int, changed_fields: dict) -> dict:
    """meta события updated. Если правка — результат отката (эндпоинт undo кладёт в
    session.info["undo_of"] {entity_type, entity_id, event_id}), событие помечается
    reverts_event_id: UI отличает откат от обычной правки и вместо «отката отката» показывает
    на исходной правке кнопку «применить снова»."""
    meta = {"changed_fields": changed_fields}
    undo_of = session.info.get("undo_of")
    if undo_of and undo_of.get("entity_type") == entity_type and undo_of.get("entity_id") == entity_id:
        meta["reverts_event_id"] = undo_of["event_id"]
    return meta


@event.listens_for(AppSession, "before_flush")
def _capture_event_log(session: Session, flush_context, instances) -> None:
    tracked_dirty = [obj for obj in session.dirty if _entity_type_for(obj) is not None]
    tracked_deleted = [obj for obj in session.deleted if _entity_type_for(obj) is not None]

    if not tracked_dirty and not tracked_deleted:
        return

    # actor_id: проставляется явно в get_current_user() через
    # session.info["actor_id"] (см. app/core/deps.py) для HTTP-запросов, или
    # фоновым джобом напрямую (см. services/prediction_reminders.py) для
    # действий без HTTP-контекста. Если не проставлен нигде — fallback на
    # системного пользователя (см. app/core/entity_registry.py), НЕ NULL:
    # actor_id в Event NOT NULL, защитный дефолт нужен, чтобы забытая
    # простановка actor_id роняла не INSERT в events, а в худшем случае
    # писала событие от имени system, что заметно и чинится, а не 500-кой.
    global _sync_system_user_id_cache
    actor_id = session.info.get("actor_id")
    if actor_id is None:
        if _sync_system_user_id_cache is not None:
            actor_id = _sync_system_user_id_cache
        else:
            # Синхронный listener внутри flush — sync-запрос через ту же
            # сессию, без await (async здесь физически невозможно, весь
            # callback выполняется через greenlet_spawn).
            row = session.execute(select(User.id).where(User.username == "system")).first()
            if row is None:
                # Не должно происходить в норме (миграция a1b2c3d4e5f6 сеет
                # system-user) — но если БД в странном состоянии, лучше явно
                # уронить flush, чем молча создать Event с actor_id=NULL и
                # упасть на NOT NULL constraint с менее понятной ошибкой.
                raise RuntimeError(
                    "event_log: system user not found — did migration a1b2c3d4e5f6 run?"
                )
            actor_id = row[0]
            _sync_system_user_id_cache = actor_id

    for obj in tracked_dirty:
        entity_type = _entity_type_for(obj)
        excluded = _EXCLUDED_FIELDS.get(entity_type, {"updated_at"})
        state = inspect(obj)
        changed_fields = {}
        for attr in state.mapper.column_attrs:
            field_name = attr.key
            if field_name in excluded:
                continue
            hist = state.attrs[field_name].history
            if not hist.has_changes():
                continue
            old_val = hist.deleted[0] if hist.deleted else None
            new_val = hist.added[0] if hist.added else None
            changed_fields[field_name] = {"old": _json_safe(old_val), "new": _json_safe(new_val)}

        if not changed_fields:
            continue

        visibility, lab_id = _resolve_visibility_lab(
            session, entity_type,
            getattr(obj, "visibility", None), getattr(obj, "lab_id", None),
            getattr(obj, "entity_type", None), getattr(obj, "entity_id", None),
        )
        session.add(Event(
            type="updated",
            actor_id=actor_id,
            entity_type=entity_type,
            entity_id=obj.id,
            lab_id=lab_id,
            visibility=visibility,
            meta=_updated_meta(session, entity_type, obj.id, changed_fields),
        ))

    for obj in tracked_deleted:
        entity_type = _entity_type_for(obj)

        # Orphan prevention: cascade-cleanup of polymorphic children on hard
        # delete of any of the 6 base entity types. Only these 6 have
        # standalone child tables today (attachment/comment/etc. are
        # themselves EVENT_LOGGED_MODELS but not parents of anything) — the
        # ENTITY_MODELS guard keeps this correct if that ever changes.
        # See backend/docs/EVENT_LOG_AND_CLEANUP.md for the registry and
        # why Link (from/to, not entity_type/entity_id) is a separate branch.
        if entity_type in ENTITY_MODELS:
            # Файлы на диске (EntityImage/EntityAttachment) — собираем пути
            # ДО удаления строк (после DELETE их уже не достать), физическое
            # os.remove откладываем до after_commit ниже: если эта транзакция
            # ещё откатится, строки (и значит право на существование файлов)
            # вернутся, а файл, стёртый прямо тут, — нет. GC для мягко
            # удалённых (deleted_at) вложений тоже теперь происходит здесь —
            # раз родитель удаляется целиком, различие soft/hard для
            # вложения больше не имеет смысла.
            pending_files = session.info.setdefault("_pending_file_cleanup", [])

            for filename, thumb_filename in session.execute(
                select(EntityImage.filename, EntityImage.thumb_filename).where(
                    EntityImage.entity_type == entity_type, EntityImage.entity_id == obj.id
                )
            ).all():
                for fn in (filename, thumb_filename):
                    if not fn:
                        continue
                    try:
                        pending_files.append(resolve_image_path(fn))
                    except ValueError:
                        pass

            attachment_rows = session.execute(
                select(EntityAttachment.id, EntityAttachment.storage_path).where(
                    EntityAttachment.entity_type == entity_type, EntityAttachment.entity_id == obj.id
                )
            ).all()
            for _attachment_id, storage_path in attachment_rows:
                if not storage_path:
                    continue
                try:
                    pending_files.append(resolve_attachment_path(storage_path))
                except ValueError:
                    pass

            # EntityAttachmentVersion — НЕ полиморфная модель (FK на attachment_id,
            # не entity_type/entity_id), поэтому не входит в цикл
            # POLYMORPHIC_CHILD_MODELS ниже и не получает автоматической обработки
            # там. Строки уйдут сами через FK ON DELETE CASCADE, когда чуть ниже
            # удалятся строки EntityAttachment — но файлы версий на диске нужно
            # собрать здесь же, ДО этого каскада, иначе станут сиротами (тот же
            # принцип, что и retention в attachment_gc.py).
            attachment_ids = [row[0] for row in attachment_rows]
            if attachment_ids:
                for (storage_path,) in session.execute(
                    select(EntityAttachmentVersion.storage_path).where(
                        EntityAttachmentVersion.attachment_id.in_(attachment_ids)
                    )
                ).all():
                    try:
                        pending_files.append(resolve_attachment_path(storage_path))
                    except ValueError:
                        pass

            for child_model in POLYMORPHIC_CHILD_MODELS.values():
                session.execute(
                    delete(child_model).where(
                        child_model.entity_type == entity_type,
                        child_model.entity_id == obj.id,
                    )
                )
            session.execute(   # согласие на открытие записи через связь: и как «что открыто», и как «через что»
                delete(RecordShare).where(or_(
                    and_(RecordShare.entity_type == entity_type, RecordShare.entity_id == obj.id),
                    and_(RecordShare.via_type == entity_type, RecordShare.via_id == obj.id))))
            session.execute(   # упоминания в тексте: и как «где упомянули», и как «кого упомянули»
                delete(EntityMention).where(or_(
                    and_(EntityMention.source_type == entity_type, EntityMention.source_id == obj.id),
                    and_(EntityMention.target_type == entity_type, EntityMention.target_id == obj.id))))
            session.execute(
                delete(Link).where(
                    or_(
                        and_(Link.from_type == entity_type, Link.from_id == obj.id),
                        and_(Link.to_type == entity_type, Link.to_id == obj.id),
                    )
                )
            )

            # EntityHypothesis — не в POLYMORPHIC_CHILD_MODELS: колонки parent_type/
            # parent_id вместо entity_type/entity_id (как у Link). Гипотеза-потомок
            # (hypothesis_id) чистится FK ondelete=CASCADE, здесь — сторона-родитель.
            if entity_type in ("task", "question"):
                session.execute(
                    delete(EntityHypothesis).where(
                        EntityHypothesis.parent_type == entity_type,
                        EntityHypothesis.parent_id == obj.id,
                    )
                )

        state = inspect(obj)
        # ТОЛЬКО колонки через mapper.columns — НЕ __dict__ (содержит
        # _sa_instance_state и служебные атрибуты сессии), НЕ relationships
        # (обращение к ним внутри before_flush триггернёт lazy-load —
        # недопустимо посреди flush, даже если объект формально ещё attached).
        snapshot = {
            col.key: _json_safe(getattr(obj, col.key))
            for col in state.mapper.columns
        }
        # Значения уже приведены к JSON-типам через _json_safe выше.

        visibility, lab_id = _resolve_visibility_lab(
            session, entity_type,
            snapshot.get("visibility"), snapshot.get("lab_id"),
            snapshot.get("entity_type"), snapshot.get("entity_id"),
        )
        session.add(Event(
            type="deleted",
            actor_id=actor_id,
            entity_type=entity_type,
            entity_id=obj.id,
            lab_id=lab_id,
            visibility=visibility,
            meta={"snapshot": snapshot},
        ))


@event.listens_for(AppSession, "after_commit")
def _cleanup_pending_files(session: Session) -> None:
    """Физическое удаление файлов, чьи БД-строки (EntityImage/EntityAttachment)
    были стёрты каскадом в _capture_event_log выше — только теперь, когда
    транзакция гарантированно закоммичена (см. комментарий у pending_files
    выше про то, почему НЕ делать os.remove прямо в before_flush)."""
    paths = session.info.pop("_pending_file_cleanup", None)
    if not paths:
        return
    for path in paths:
        try:
            os.remove(path)
        except OSError:
            pass


@event.listens_for(AppSession, "after_rollback")
def _clear_pending_files_on_rollback(session: Session) -> None:
    """Без этого список путей, собранный до отката, пережил бы rollback в
    session.info (он живёт на сессию, не на транзакцию) и был бы ошибочно
    обработан при следующем, уже не связанном с удалением, commit() на той
    же сессии."""
    session.info.pop("_pending_file_cleanup", None)
