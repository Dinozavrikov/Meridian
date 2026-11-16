"""Мутации связей без коммита: удалить свою связь, сменить её тип, то же для связи прогноз↔гипотеза в поле.

Единственное место, где это делается: одиночные обработчики (graph.py, entity_field_link.py) и пакетный
эндпоинт (api/v1/link_batch.py) вызывают эти функции, поэтому правила прав и события не расходятся.
Функции не коммитят — коммит или откат за вызывающим (для пакета он один на все операции).
batch_id, если передан, пишется в meta каждого события: по нему откатывается весь пакет."""
from fastapi import HTTPException
from sqlalchemy import select

from app.core.lab_access import get_live
from app.core.prediction_status import CLOSED_PREDICTION_STATUSES
from app.models.entities import Hypothesis, Link, Prediction
from app.services.events import emit_event
from app.services.evidence_diversity import invalidate_evidence_diversity
from app.services.link_events import link_event_scope, pair_filter

LINK_TYPES = {"подтверждает", "опровергает", "связано", "related"}
# Типы связи с доказательным смыслом: их считают сигнал гипотезы и полоса согласия в ленте.
EVIDENCE_LINK_TYPES = frozenset({"подтверждает", "опровергает"})
NEUTRAL_LINK_TYPES = frozenset({"связано", "related"})
# Как запись действует на убеждение: у убеждений свой словарь (в интерфейсе «Укрепляет / Бросает вызов / ...»).
WORLDVIEW_INFLUENCE_TYPES = frozenset({"strengthens", "challenges", "transforms", "contradicts"})
ALL_LINK_TYPES = LINK_TYPES | WORLDVIEW_INFLUENCE_TYPES


def allowed_link_types(from_type: str, to_type: str) -> frozenset[str]:
    """Словарь типов связи для пары записей: единственное место, где он определён (фронтенд зеркалит его в lib/link-vocab.ts).
    С убеждением: четыре типа влияния и нейтральная связь. Записи одного типа: только нейтральная («подтверждает/опровергает»
    между гипотезой и гипотезой не имеет смысла, а полоса согласия в ленте считала бы такую связь). Остальные пары: доказательные
    и нейтральная. Старые связи не пересчитываем, а откат удаления и смены типа возвращает прежнее состояние и сюда не ходит."""
    if "worldview" in (from_type, to_type):
        return WORLDVIEW_INFLUENCE_TYPES | NEUTRAL_LINK_TYPES
    if from_type == to_type:
        return NEUTRAL_LINK_TYPES
    return EVIDENCE_LINK_TYPES | NEUTRAL_LINK_TYPES


def ensure_link_type_allowed(from_type: str, to_type: str, link_type: str) -> None:
    if link_type not in allowed_link_types(from_type, to_type):
        raise HTTPException(400, "Недопустимый тип связи для этой пары записей")


STANCE = {True: "подтверждает", False: "опровергает"}
Ref = tuple[str, int]


def _meta(meta: dict, batch_id: str | None) -> dict:
    return {**meta, "batch_id": batch_id} if batch_id else meta


async def _own_rows(db, user_id: int, a: Ref, b: Ref):
    return (await db.execute(select(Link).where(Link.user_id == user_id, pair_filter(a[0], a[1], b[0], b[1])))).scalars().all()


async def remove_own_links(db, user_id: int, a: Ref, b: Ref, *, batch_id: str | None = None) -> int:
    """Удаляет СВОИ связи между двумя записями (любое направление), пишет unlinked. Возвращает, сколько удалено."""
    rows = await _own_rows(db, user_id, a, b)
    for lnk in rows:
        lab_id, vis = await link_event_scope(db, user_id, lnk.from_type, lnk.from_id, lnk.to_type, lnk.to_id)
        await emit_event(db, type="unlinked", actor_id=user_id, entity_type=lnk.from_type, entity_id=lnk.from_id,
                         related_type=lnk.to_type, related_id=lnk.to_id, lab_id=lab_id, visibility=vis,
                         meta=_meta({"link_type": lnk.link_type}, batch_id))
        await db.delete(lnk)
        from app.core.lab_access import revoke_shares
        await revoke_shares(db, (lnk.from_type, lnk.from_id), (lnk.to_type, lnk.to_id))
    return len(rows)


async def set_own_link_type(db, user_id: int, a: Ref, b: Ref, link_type: str, *, batch_id: str | None = None) -> None:
    """Меняет тип своей связи, пишет link_type_changed (old/new). 400 — недопустимый тип, 404 — своей связи нет."""
    if link_type not in ALL_LINK_TYPES:
        raise HTTPException(400, "Недопустимый тип связи")
    rows = await _own_rows(db, user_id, a, b)
    if not rows:
        raise HTTPException(404, "Связь не найдена")
    for lnk in rows:
        ensure_link_type_allowed(lnk.from_type, lnk.to_type, link_type)
    for lnk in rows:
        if lnk.link_type == link_type:
            continue
        lab_id, vis = await link_event_scope(db, user_id, lnk.from_type, lnk.from_id, lnk.to_type, lnk.to_id)
        await emit_event(db, type="link_type_changed", actor_id=user_id, entity_type=lnk.from_type, entity_id=lnk.from_id,
                         related_type=lnk.to_type, related_id=lnk.to_id, lab_id=lab_id, visibility=vis,
                         meta=_meta({"old": lnk.link_type, "new": link_type}, batch_id))
        lnk.link_type = link_type


async def _open_own_prediction(db, user_id: int, pid: int, hypothesis_id: int | None):
    """Свой незакрытый прогноз со связью; hypothesis_id, если задан, должен совпадать с привязанной гипотезой."""
    pred = await get_live(db, Prediction, pid)
    if pred is None or pred.user_id != user_id or pred.hypothesis_id is None \
            or (hypothesis_id is not None and pred.hypothesis_id != hypothesis_id):
        raise HTTPException(404, "Не найдено")
    if pred.status in CLOSED_PREDICTION_STATUSES:
        raise HTTPException(400, "У закрытого прогноза связь с гипотезой менять нельзя: исход уже учтён")
    return pred, await get_live(db, Hypothesis, pred.hypothesis_id)


async def set_field_stance(db, user_id: int, pid: int, confirms: bool, *, hypothesis_id: int | None = None,
                           batch_id: str | None = None) -> tuple[int, str]:
    """Тип связи прогноза с гипотезой (подтверждает/опровергает). Возвращает (id гипотезы, новый тип)."""
    pred, hyp = await _open_own_prediction(db, user_id, pid, hypothesis_id)
    if hyp is None:
        raise HTTPException(404, "Гипотеза недоступна")
    old, new = STANCE[pred.confirms_hypothesis_if_true], STANCE[confirms]
    if old != new:
        lab_id, vis = await link_event_scope(db, user_id, "prediction", pid, "hypothesis", hyp.id)
        await emit_event(db, type="field_link_changed", actor_id=user_id, entity_type="prediction", entity_id=pid,
                         related_type="hypothesis", related_id=hyp.id, lab_id=lab_id, visibility=vis,
                         meta=_meta({"old": old, "new": new}, batch_id))
        pred.confirms_hypothesis_if_true = confirms
        invalidate_evidence_diversity(hyp)
    return hyp.id, new


async def remove_field_link(db, user_id: int, pid: int, *, hypothesis_id: int | None = None, batch_id: str | None = None) -> None:
    pred, hyp = await _open_own_prediction(db, user_id, pid, hypothesis_id)
    hid = pred.hypothesis_id
    lab_id, vis = await link_event_scope(db, user_id, "prediction", pid, "hypothesis", hid)
    await emit_event(db, type="field_unlinked", actor_id=user_id, entity_type="prediction", entity_id=pid,
                     related_type="hypothesis", related_id=hid, lab_id=lab_id, visibility=vis,
                     meta=_meta({"link_type": STANCE[pred.confirms_hypothesis_if_true]}, batch_id))
    pred.hypothesis_id = None
    from app.core.lab_access import revoke_shares
    await revoke_shares(db, ("prediction", pid), ("hypothesis", hid))
    if hyp is not None:
        invalidate_evidence_diversity(hyp)
