"""Откат правки поля и история правок сущности (только владелец).

POST /{entity_type}/{entity_id}/undo/{event_id} — вернуть поля одного Event(updated)
  к значению «до» (правила и allowlist — services/undo.py).
GET  /{entity_type}/{entity_id}/history — список updated-событий с готовым вердиктом
  undoable/blocked_code: фронт не дублирует логику конфликтов.

Чужая/мёртвая/несуществующая запись и событие другой сущности — 404, не 403
(не подтверждаем факт существования, как trash.py)."""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from app.core.lab_access import ShareChoice
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.core.entity_registry import ENTITY_MODELS
from app.core.lab_access import can_undo
from app.db.session import get_db
from app.models.entities import Event
from app.models.user import User
from app.services.events import emit_event
from app.services.link_events import (
    LINK_EVENT_TYPES, SHARE_TYPES, entity_title, evaluate_link_undo, event_touches, undo_link_event,
)
from app.services.scale_values import set_scale_value
from app.services.undo import apply_undo, evaluate_undo, load_scale_context, scale_undo_values

from app.core.lab_access import reset_shares_on_visibility_change
from app.services.undo import load_visibility_context, visibility_target

router = APIRouter(tags=["undo"])

_HTTP_STATUS_BY_CODE = {"not_updated_event": 400, "malformed_event": 400}


class HistoryItem(BaseModel):
    id: int
    created_at: datetime
    actor_id: int
    changed_fields: dict[str, dict]
    undoable: bool
    blocked_code: Optional[str] = None
    blocked_fields: list[str] = []
    reverted: bool = False  # инфо для UI: по этому событию был выполнен undo; на вердикт не влияет
    reverts_event_id: Optional[int] = None  # событие порождено откатом указанного события (иначе None)


def _reverts_id(ev: Event) -> Optional[int]:
    v = (ev.meta or {}).get("reverts_event_id")
    return v if isinstance(v, int) and not isinstance(v, bool) else None


async def _load_live_owned(db: AsyncSession, entity_type: str, entity_id: int, user: User, *, lock: bool):
    model = ENTITY_MODELS.get(entity_type)
    if model is None:
        raise HTTPException(400, "Invalid entity type")
    stmt = select(model).where(model.id == entity_id).execution_options(populate_existing=True)
    if lock:
        # Проверка конфликта и запись — под одной блокировкой строки, иначе параллельный
        # PUT может проскочить между ними и быть молча перезаписан.
        stmt = stmt.with_for_update()
    obj = (await db.execute(stmt)).scalar_one_or_none()
    if obj is None or obj.deleted_at is not None or not can_undo(obj, user.id):
        raise HTTPException(404, "Не найдено")
    return obj


@router.post("/{entity_type}/{entity_id}/undo/{event_id}")
async def undo_event(entity_type: str, entity_id: int, event_id: int, share: ShareChoice = None,
                     user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    obj = await _load_live_owned(db, entity_type, entity_id, user, lock=True)
    ev = await db.get(Event, event_id)
    if ev is not None and ev.type in LINK_EVENT_TYPES:
        # События связей откатываются отдельно (services/link_events.py): они не про поля записи.
        if not event_touches(ev, entity_type, entity_id):
            raise HTTPException(404, "Не найдено")
        a_type, a_id, b_type, b_id = await undo_link_event(db, user.id, ev, share)
        await db.commit()
        from app.api.v1.graph import _recompute_if_observation_hypothesis_link
        await _recompute_if_observation_hypothesis_link(db, a_type, a_id, b_type, b_id, user.id)
        return {"reverted_event_id": ev.id, "fields": []}
    # Событие чужой сущности по угаданному id — 404, не «откатим что-нибудь не то».
    if ev is None or ev.entity_type != entity_type or ev.entity_id != entity_id:
        raise HTTPException(404, "Не найдено")

    scales = await load_scale_context(db, user.id, entity_type, entity_id)
    vis_ctx = await load_visibility_context(db, user.id, [ev])
    verdict = evaluate_undo(obj, entity_type, ev, scales, vis_ctx)
    if not verdict.ok:
        raise HTTPException(
            _HTTP_STATUS_BY_CODE.get(verdict.code, 409),
            detail={"code": verdict.code, "fields": list(verdict.fields)},
        )

    # События updated, порождённые откатом, помечаются reverts_event_id (event_log._updated_meta):
    # UI отличает откат от обычной правки. Ключ снимается в finally — сессия не должна унести его
    # в чужой commit.
    vis_target = visibility_target(obj, ev)   # None, если событие видимости не касается; считается ДО присваиваний
    db.sync_session.info["undo_of"] = {"entity_type": entity_type, "entity_id": entity_id, "event_id": ev.id}
    try:
        if vis_target is not None:
            # Видимость возвращается теми же правилами, что обычная смена: снять согласия и записать visibility_changed.
            # ДО любых присваиваний: execute внутри делает автосброс и разрезал бы изменения на два события updated
            # (регрессия e7d9aa7, test_update_single_event).
            await reset_shares_on_visibility_change(db, entity_type, obj, vis_target[0], vis_target[1],
                                                    actor_id=user.id, reverts_event_id=ev.id)
        fields = apply_undo(obj, ev)
        if vis_target is not None:
            obj.visibility, obj.lab_id = vis_target
        for scale_id, old_value in scale_undo_values(ev).items():
            await set_scale_value(db, user_id=user.id, obj=obj, entity_type=entity_type,
                                  scale_id=scale_id, value=old_value, reverts_event_id=ev.id)
        # Generic `updated` с откатанными значениями создаст before_flush-листенер сам;
        # `undone` — явный маркер для читаемости истории (как status_changed/soft_deleted).
        await emit_event(
            db, type="undone", actor_id=user.id, entity_type=entity_type, entity_id=entity_id,
            lab_id=obj.lab_id, visibility=obj.visibility,
            meta={"reverted_event_id": ev.id, "fields": fields},
        )
        await db.commit()
    finally:
        db.sync_session.info.pop("undo_of", None)
    return {"reverted_event_id": ev.id, "fields": fields}


@router.get("/{entity_type}/{entity_id}/history", response_model=list[HistoryItem])
async def entity_history(entity_type: str, entity_id: int, limit: int = 50,
                         user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    obj = await _load_live_owned(db, entity_type, entity_id, user, lock=False)
    limit = max(1, min(limit, 200))
    events = (await db.execute(
        select(Event).where(Event.entity_type == entity_type, Event.entity_id == entity_id,
                            Event.type == "updated")
        .order_by(Event.id.desc()).limit(limit)
    )).scalars().all()
    markers = (await db.execute(
        select(Event.meta).where(Event.entity_type == entity_type, Event.entity_id == entity_id,
                                 Event.type == "undone")
    )).scalars().all()
    reverted = {m.get("reverted_event_id") for m in markers if isinstance(m, dict)}

    scales = await load_scale_context(db, user.id, entity_type, entity_id)
    vis_ctx = await load_visibility_context(db, user.id, events)
    items: list[HistoryItem] = []
    for ev in events:
        v = evaluate_undo(obj, entity_type, ev, scales, vis_ctx)
        items.append(HistoryItem(
            id=ev.id, created_at=ev.created_at, actor_id=ev.actor_id,
            changed_fields=(ev.meta or {}).get("changed_fields", {}),
            undoable=v.ok, blocked_code=v.code, blocked_fields=list(v.fields),
            reverted=ev.id in reverted,
            reverts_event_id=_reverts_id(ev),
        ))
    return items


def _own_share_events_only(user_id: int):
    """События share_closed/share_opened приватные: в истории связей их видит только автор (другая сторона связи не должна)."""
    from sqlalchemy import or_
    return or_(Event.type.notin_(SHARE_TYPES), Event.actor_id == user_id)


class LinkHistoryOut(BaseModel):
    id: int
    created_at: datetime
    actor_id: int
    type: str  # linked | unlinked | link_type_changed
    other_type: str
    other_id: int
    other_title: Optional[str] = None
    link_type: Optional[str] = None
    old: Optional[str] = None
    new: Optional[str] = None
    undoable: bool
    blocked_code: Optional[str] = None
    reverted: bool = False
    reverts_event_id: Optional[int] = None
    batch_id: Optional[str] = None  # общий у событий одного пакетного действия (из meta)


def _pair_filter(entity_type: str, entity_id: int, other_type: Optional[str], other_id: Optional[int]) -> list:
    """Необязательный фильтр «только события этой пары записей» (оба направления). Оба параметра вместе или ни одного."""
    if other_type is None and other_id is None:
        return []
    if other_type is None or other_id is None:
        raise HTTPException(422, "other_type и other_id задаются вместе")
    from sqlalchemy import and_, or_
    return [or_(
        and_(Event.entity_type == entity_type, Event.entity_id == entity_id, Event.related_type == other_type, Event.related_id == other_id),
        and_(Event.entity_type == other_type, Event.entity_id == other_id, Event.related_type == entity_type, Event.related_id == entity_id),
    )]


@router.get("/{entity_type}/{entity_id}/link-history", response_model=list[LinkHistoryOut])
async def link_history(entity_type: str, entity_id: int, limit: int = 50,
                       other_type: Optional[str] = None, other_id: Optional[int] = None,
                       user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """История связей записи (добавление, удаление, смена типа) с готовым вердиктом отката.

    limit — окно по событиям; пакеты, задетые окном, дополняются до целых (длина ответа может превысить limit).
    other_type + other_id: только события этой пары записей (для «Вернуть»: нужное событие не зависит от размера окна)."""
    from sqlalchemy import and_, or_
    await _load_live_owned(db, entity_type, entity_id, user, lock=False)
    limit = max(1, min(limit, 200))
    events = (await db.execute(
        select(Event).where(
            Event.type.in_(LINK_EVENT_TYPES), _own_share_events_only(user.id), *_pair_filter(entity_type, entity_id, other_type, other_id),
            or_(and_(Event.entity_type == entity_type, Event.entity_id == entity_id),
                and_(Event.related_type == entity_type, Event.related_id == entity_id)))
        .order_by(Event.id.desc()).limit(limit)
    )).scalars().all()
    # Окно limit не режет пакет: если в окно попало хоть одно событие пакетного действия, остальные его
    # события добираются (в пакете <=50 операций). Иначе «Откатить пакет» откатил бы больше, чем видно.
    batch_ids = {b for b in ((e.meta or {}).get("batch_id") for e in events) if b}
    if batch_ids:
        extra = (await db.execute(
            select(Event).where(
                Event.type.in_(LINK_EVENT_TYPES), _own_share_events_only(user.id), *_pair_filter(entity_type, entity_id, other_type, other_id),
                or_(and_(Event.entity_type == entity_type, Event.entity_id == entity_id),
                    and_(Event.related_type == entity_type, Event.related_id == entity_id)),
                Event.meta["batch_id"].astext.in_(batch_ids),
                Event.id.notin_([e.id for e in events]))
        )).scalars().all()
        events = sorted([*events, *extra], key=lambda e: e.id, reverse=True)
    reverted = {(e.meta or {}).get("reverts_event_id") for e in events}
    items: list[LinkHistoryOut] = []
    for ev in events:
        meta = ev.meta or {}
        mine = (ev.entity_type, ev.entity_id) == (entity_type, entity_id)
        o_type, o_id = (ev.related_type, ev.related_id) if mine else (ev.entity_type, ev.entity_id)
        code, _rows = await evaluate_link_undo(db, user.id, ev)
        items.append(LinkHistoryOut(
            id=ev.id, created_at=ev.created_at, actor_id=ev.actor_id, type=ev.type,
            other_type=o_type, other_id=o_id, other_title=await entity_title(db, o_type, o_id),
            link_type=meta.get("link_type"), old=meta.get("old"), new=meta.get("new"),
            undoable=code is None, blocked_code=code,
            reverted=ev.id in reverted, reverts_event_id=meta.get("reverts_event_id"),
            batch_id=meta.get("batch_id"),
        ))
    return items
