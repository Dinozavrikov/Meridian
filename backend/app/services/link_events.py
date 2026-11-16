"""События связей (linked / unlinked / link_type_changed) и их откат.

Откат связей — отдельно от отката полей (services/undo.py): связь живёт в таблице links, а не в колонках
записи. Вердикт один (evaluate_link_undo): им пользуются и эндпоинт отката, и список истории.
Откат разрешён, только если состояние связи совпадает с тем, что оставило откатываемое событие
(как git revert); сам откат пишет обратное событие с reverts_event_id, поэтому его тоже можно откатить."""
from fastapi import HTTPException
from sqlalchemy import and_, delete, or_, select

from app.core.entity_registry import ENTITY_MODELS
from app.core.lab_access import can_link, get_entity_for_lab_manage, get_live, require_publication_consent, grant_publication, publication_impact
from app.models.entities import EntityHypothesis, Link, Prediction, RecordShare
from app.services.events import emit_event

COMPETING_TYPES = ("competing_hypothesis", "competing_unlinked", "competing_changed")
FIELD_TYPES = ("field_linked", "field_unlinked", "field_link_changed")
SHARE_TYPES = ("share_closed", "share_opened")   # закрытие/возврат доступа через связь («Кому открыто»); события приватные
LINK_EVENT_TYPES = ("linked", "unlinked", "link_type_changed") + COMPETING_TYPES + FIELD_TYPES + SHARE_TYPES

_TITLE = {
    "observation": lambda o: o.title, "hypothesis": lambda o: o.name,
    "prediction": lambda o: o.title or (o.text or "")[:80], "question": lambda o: o.title,
    "worldview": lambda o: (o.belief or "")[:80], "task": lambda o: o.name,
}


def pair_filter(a_type, a_id, b_type, b_id):
    """Связь между двумя записями в любом направлении."""
    return or_(
        and_(Link.from_type == a_type, Link.from_id == a_id, Link.to_type == b_type, Link.to_id == b_id),
        and_(Link.from_type == b_type, Link.from_id == b_id, Link.to_type == a_type, Link.to_id == a_id),
    )


async def link_event_scope(db, user_id, from_type, from_id, to_type, to_id):
    """(lab_id, visibility) события: сторона автора, иначе любая лабораторная, иначе приватно
    (то же правило, что в graph.add_link)."""
    fm, tm = ENTITY_MODELS.get(from_type), ENTITY_MODELS.get(to_type)
    from_obj = await db.get(fm, from_id) if fm else None
    to_obj = await db.get(tm, to_id) if tm else None
    if from_obj and from_obj.user_id == user_id:
        return from_obj.lab_id, from_obj.visibility
    if to_obj and to_obj.user_id == user_id:
        return to_obj.lab_id, to_obj.visibility
    lab_id = (from_obj.lab_id if from_obj else None) or (to_obj.lab_id if to_obj else None)
    return lab_id, ("lab" if lab_id else "private")


def event_touches(ev, entity_type, entity_id) -> bool:
    return (ev.entity_type, ev.entity_id) == (entity_type, entity_id) or (ev.related_type, ev.related_id) == (entity_type, entity_id)


async def entity_title(db, entity_type, entity_id):
    model = ENTITY_MODELS.get(entity_type)
    obj = await db.get(model, entity_id) if model else None
    if obj is None or getattr(obj, "deleted_at", None) is not None:
        return None
    return _TITLE[entity_type](obj)


async def evaluate_link_undo(db, user_id, ev):
    """(код блокировки | None, мои строки links по паре)."""
    if ev.actor_id != user_id:
        return "not_author", []
    if ev.type in SHARE_TYPES:
        return await _evaluate_share(db, ev), []
    if ev.type in FIELD_TYPES:
        return await _evaluate_field(db, ev), []
    if ev.type in COMPETING_TYPES:
        return await _evaluate_competing(db, ev), []
    meta = ev.meta or {}
    rows = (await db.execute(select(Link).where(
        Link.user_id == user_id, pair_filter(ev.entity_type, ev.entity_id, ev.related_type, ev.related_id)))).scalars().all()
    if ev.type == "linked":
        if not rows:
            return "link_missing", rows
        if rows[0].link_type != meta.get("link_type"):
            return "link_changed", rows
    elif ev.type == "unlinked":
        if rows:
            return "link_exists", rows
        for t, i in ((ev.entity_type, ev.entity_id), (ev.related_type, ev.related_id)):
            model = ENTITY_MODELS.get(t)
            obj = await db.get(model, i) if model else None
            if obj is None or obj.deleted_at is not None:
                return "endpoint_gone", rows
    elif ev.type == "link_type_changed":
        if not rows:
            return "link_missing", rows
        if rows[0].link_type != meta.get("new"):
            return "link_changed", rows
    else:
        return "not_link_event", rows
    return None, rows


async def undo_link_event(db, user_id, ev, share=None):
    """Откатывает событие связи; не коммитит. Возвращает (from_type, from_id, to_type, to_id) для пересчёта сигнала."""
    code, rows = await evaluate_link_undo(db, user_id, ev)
    if code:
        raise HTTPException(404 if code == "not_author" else 409, detail={"code": code, "fields": []})
    if ev.type in SHARE_TYPES:
        return await _undo_share(db, user_id, ev)
    if ev.type in FIELD_TYPES:
        return await _undo_field(db, user_id, ev, share)
    if ev.type in COMPETING_TYPES:
        return await _undo_competing(db, user_id, ev, share)
    meta = ev.meta or {}
    lab_id, vis = await link_event_scope(db, user_id, ev.entity_type, ev.entity_id, ev.related_type, ev.related_id)
    if ev.type == "linked":
        lt = rows[0].link_type
        for r in rows:
            await db.delete(r)
        from app.core.lab_access import revoke_shares
        await revoke_shares(db, (ev.entity_type, ev.entity_id), (ev.related_type, ev.related_id))
        back_type, back_meta = "unlinked", {"link_type": lt}
    elif ev.type == "unlinked":
        ends = []
        for t, i in ((ev.entity_type, ev.entity_id), (ev.related_type, ev.related_id)):
            end = await get_live(db, ENTITY_MODELS[t], i)
            if end is None:
                raise HTTPException(409, detail={"code": "endpoint_gone", "fields": []})
            await can_link(db, type(end), i, user_id)
            ends.append((t, end))
        impacts = await require_publication_consent(db, ends[0], ends[1], user_id, share)   # возврат связи снова может открыть запись
        await grant_publication(db, impacts, user_id)
        lt = meta.get("link_type", "related")
        db.add(Link(user_id=user_id, from_type=ev.entity_type, from_id=ev.entity_id,
                    to_type=ev.related_type, to_id=ev.related_id, link_type=lt))
        back_type, back_meta = "linked", {"link_type": lt}
    else:
        old, new = meta.get("old"), meta.get("new")
        for r in rows:
            r.link_type = old
        back_type, back_meta = "link_type_changed", {"old": new, "new": old}
    await emit_event(db, type=back_type, actor_id=user_id, entity_type=ev.entity_type, entity_id=ev.entity_id,
                     related_type=ev.related_type, related_id=ev.related_id, lab_id=lab_id, visibility=vis,
                     meta={**back_meta, "reverts_event_id": ev.id})
    return ev.entity_type, ev.entity_id, ev.related_type, ev.related_id


# ── конкурирующие гипотезы: строка entity_hypotheses (родитель task|question + гипотеза) ──────────
# Событие: entity = гипотеза, related = родитель (так его пишут и эндпоинты добавления).

async def _competing_row(db, parent_type, parent_id, hypothesis_id):
    return (await db.execute(select(EntityHypothesis).where(
        EntityHypothesis.parent_type == parent_type, EntityHypothesis.parent_id == parent_id,
        EntityHypothesis.hypothesis_id == hypothesis_id))).scalar_one_or_none()


async def _evaluate_competing(db, ev):
    row = await _competing_row(db, ev.related_type, ev.related_id, ev.entity_id)
    if ev.type == "competing_changed":
        field = (ev.meta or {}).get("field")
        if row is None:
            return "link_missing"
        if field not in ("role", "stance") or getattr(row, field) != (ev.meta or {}).get("new"):
            return "link_changed"
        return None
    if ev.type == "competing_hypothesis":
        return None if row else "link_missing"
    if row:
        return "link_exists"
    for t, i in ((ev.related_type, ev.related_id), (ev.entity_type, ev.entity_id)):
        model = ENTITY_MODELS.get(t)
        if model is None or await get_live(db, model, i) is None:
            return "endpoint_gone"
    return None


async def _undo_competing(db, user_id, ev, share=None):
    pmodel = ENTITY_MODELS.get(ev.related_type)
    parent = await get_live(db, pmodel, ev.related_id) if pmodel else None
    if parent is None:
        raise HTTPException(409, detail={"code": "endpoint_gone", "fields": []})
    await get_entity_for_lab_manage(db, type(parent), ev.related_id, user_id)
    meta = ev.meta or {}
    if ev.type == "competing_changed":
        row = await _competing_row(db, ev.related_type, ev.related_id, ev.entity_id)
        field = meta.get("field")
        if row is None or field not in ("role", "stance") or getattr(row, field) != meta.get("new"):
            raise HTTPException(409, detail={"code": "link_changed", "fields": []})
        lab_id, vis = await link_event_scope(db, user_id, ev.entity_type, ev.entity_id, ev.related_type, ev.related_id)
        setattr(row, field, meta.get("old"))
        back = {"field": field, "old": meta.get("new"), "new": meta.get("old")}
        if field == "role" and meta.get("old") == "leading":
            back["demoted"] = await demote_other_leading(db, ev.related_type, ev.related_id, ev.entity_id)
        for hid in meta.get("demoted", []):  # вернуть тех, кого это изменение разжаловало
            other = await _competing_row(db, ev.related_type, ev.related_id, hid)
            if other is not None and other.role == "alternative" and row.role != "leading":
                other.role = "leading"
        await emit_event(db, type="competing_changed", actor_id=user_id, entity_type=ev.entity_type, entity_id=ev.entity_id,
                         related_type=ev.related_type, related_id=ev.related_id, lab_id=lab_id, visibility=vis,
                         meta={**back, "reverts_event_id": ev.id})
        return ev.entity_type, ev.entity_id, ev.related_type, ev.related_id
    lab_id, vis = await link_event_scope(db, user_id, ev.entity_type, ev.entity_id, ev.related_type, ev.related_id)
    if ev.type == "competing_hypothesis":
        await db.execute(delete(EntityHypothesis).where(
            EntityHypothesis.parent_type == ev.related_type, EntityHypothesis.parent_id == ev.related_id,
            EntityHypothesis.hypothesis_id == ev.entity_id))
        back = "competing_unlinked"
    else:
        hmodel = ENTITY_MODELS.get("hypothesis")
        hyp = await get_live(db, hmodel, ev.entity_id)
        await can_link(db, type(hyp), ev.entity_id, user_id)
        impacts = await require_publication_consent(db, (ev.related_type, parent), ("hypothesis", hyp), user_id, share, same_owner_only=True)
        await grant_publication(db, impacts, user_id)
        db.add(EntityHypothesis(parent_type=ev.related_type, parent_id=ev.related_id, hypothesis_id=ev.entity_id,
                                role=meta.get("role", "alternative"), stance=meta.get("stance", "связано")))
        if meta.get("role") == "leading":
            await demote_other_leading(db, ev.related_type, ev.related_id, ev.entity_id)
        back = "competing_hypothesis"
    await emit_event(db, type=back, actor_id=user_id, entity_type=ev.entity_type, entity_id=ev.entity_id,
                     related_type=ev.related_type, related_id=ev.related_id, lab_id=lab_id, visibility=vis,
                     meta={"reverts_event_id": ev.id})
    return ev.entity_type, ev.entity_id, ev.related_type, ev.related_id


async def emit_competing_unlinked(db, user_id, parent_type, parent_id, hypothesis_id):
    """Вызывается перед удалением строки entity_hypotheses: пишет событие, по которому связь можно вернуть."""
    row = await _competing_row(db, parent_type, parent_id, hypothesis_id)
    if row is None:
        return
    lab_id, vis = await link_event_scope(db, user_id, "hypothesis", hypothesis_id, parent_type, parent_id)
    await emit_event(db, type="competing_unlinked", actor_id=user_id, entity_type="hypothesis", entity_id=hypothesis_id,
                     related_type=parent_type, related_id=parent_id, lab_id=lab_id, visibility=vis,
                     meta={"role": row.role, "stance": row.stance})


async def demote_other_leading(db, parent_type, parent_id, except_hypothesis_id):
    """Ведущая гипотеза одна: прежних ведущих переводит в «альтернативу», возвращает их id."""
    rows = (await db.execute(select(EntityHypothesis).where(
        EntityHypothesis.parent_type == parent_type, EntityHypothesis.parent_id == parent_id,
        EntityHypothesis.hypothesis_id != except_hypothesis_id, EntityHypothesis.role == "leading"))).scalars().all()
    for r in rows:
        r.role = "alternative"
    return [r.hypothesis_id for r in rows]


# ── связь прогноз↔гипотеза в поле predictions.hypothesis_id (entity = прогноз, related = гипотеза) ─────
from app.core.prediction_status import CLOSED_PREDICTION_STATUSES  # noqa: E402
from app.models.entities import Hypothesis, Prediction  # noqa: E402
from app.services.evidence_diversity import invalidate_evidence_diversity  # noqa: E402

_STANCE = {True: "подтверждает", False: "опровергает"}


async def _evaluate_field(db, ev):
    pred = await get_live(db, Prediction, ev.entity_id)
    if pred is None or await get_live(db, Hypothesis, ev.related_id) is None:
        return "endpoint_gone"
    if pred.status in CLOSED_PREDICTION_STATUSES:
        return "pred_closed"
    if ev.type == "field_unlinked":
        return "link_exists" if pred.hypothesis_id is not None else None
    if pred.hypothesis_id != ev.related_id:
        return "link_missing"
    if ev.type == "field_link_changed" and _STANCE[pred.confirms_hypothesis_if_true] != (ev.meta or {}).get("new"):
        return "link_changed"
    return None


async def _undo_field(db, user_id, ev, share=None):
    pred = await get_live(db, Prediction, ev.entity_id)
    if pred is None or pred.user_id != user_id:
        raise HTTPException(404, "Не найдено")
    hyp = await get_live(db, Hypothesis, ev.related_id)
    meta = ev.meta or {}
    lab_id, vis = await link_event_scope(db, user_id, ev.entity_type, ev.entity_id, ev.related_type, ev.related_id)
    if ev.type == "field_unlinked":
        field_hyp = await can_link(db, Hypothesis, ev.related_id, user_id)
        impacts = await require_publication_consent(db, ("prediction", pred), ("hypothesis", field_hyp), user_id, share)
        await grant_publication(db, impacts, user_id)
        pred.hypothesis_id = ev.related_id
        pred.confirms_hypothesis_if_true = meta.get("link_type") != "опровергает"
        back, back_meta = "field_linked", {"link_type": meta.get("link_type")}
    elif ev.type == "field_linked":
        back, back_meta = "field_unlinked", {"link_type": _STANCE[pred.confirms_hypothesis_if_true]}
        pred.hypothesis_id = None
    else:
        pred.confirms_hypothesis_if_true = meta.get("old") != "опровергает"
        back, back_meta = "field_link_changed", {"old": meta.get("new"), "new": meta.get("old")}
    invalidate_evidence_diversity(hyp)
    await emit_event(db, type=back, actor_id=user_id, entity_type=ev.entity_type, entity_id=ev.entity_id,
                     related_type=ev.related_type, related_id=ev.related_id, lab_id=lab_id, visibility=vis,
                     meta={**back_meta, "reverts_event_id": ev.id})
    return ev.entity_type, ev.entity_id, ev.related_type, ev.related_id


# ── доступ через связь (record_shares): закрытие и возврат ────────────────────────────────────────────────
def _share_row_stmt(ev, lab_id):
    return select(RecordShare).where(
        RecordShare.entity_type == ev.entity_type, RecordShare.entity_id == ev.entity_id, RecordShare.lab_id == lab_id,
        RecordShare.via_type == ev.related_type, RecordShare.via_id == ev.related_id)


async def _edge_exists(db, a, b) -> bool:
    """Есть ли между записями связь любого вида: Link, привязка гипотезы к цели или поле прогноза."""
    (at, ai), (bt, bi) = a, b
    if await db.scalar(select(Link.id).where(pair_filter(at, ai, bt, bi)).limit(1)) is not None:
        return True
    for (pt, pi), (ht, hi) in (((at, ai), (bt, bi)), ((bt, bi), (at, ai))):
        if ht != "hypothesis":
            continue
        if await db.scalar(select(EntityHypothesis.hypothesis_id).where(
                EntityHypothesis.parent_type == pt, EntityHypothesis.parent_id == pi, EntityHypothesis.hypothesis_id == hi).limit(1)) is not None:
            return True
        if pt == "prediction" and await db.scalar(select(Prediction.id).where(Prediction.id == pi, Prediction.hypothesis_id == hi, Prediction.deleted_at.is_(None))) is not None:
            return True
    return False


async def _evaluate_share(db, ev):
    """Код блокировки | None. share_closed откатывается, пока согласие не вернули, связь жива и запись всё ещё приватна
    (publication_impact повторяет условия открытия); share_opened (возврат) откатывается, пока согласие на месте."""
    lab_id = (ev.meta or {}).get("share_lab_id")
    row = await db.scalar(_share_row_stmt(ev, lab_id))
    if ev.type == "share_opened":
        return None if row is not None else "link_changed"
    if row is not None:
        return "link_exists"
    n = await get_live(db, ENTITY_MODELS[ev.entity_type], ev.entity_id)
    via = await get_live(db, ENTITY_MODELS[ev.related_type], ev.related_id) if ev.related_type in ENTITY_MODELS else None
    if n is None or via is None:
        return "endpoint_gone"
    if not await _edge_exists(db, (ev.entity_type, ev.entity_id), (ev.related_type, ev.related_id)):
        return "link_missing"
    impacts = await publication_impact(db, (ev.entity_type, n), (ev.related_type, via), ev.actor_id)
    if not any(i["lab_id"] == lab_id and i["entity_id"] == ev.entity_id for i in impacts):
        return "link_changed"   # запись уже не приватна, лаборатория или связь изменились: возвращать нечего
    return None


async def _undo_share(db, user_id, ev):
    lab_id = (ev.meta or {}).get("share_lab_id")
    if ev.type == "share_closed":
        db.add(RecordShare(entity_type=ev.entity_type, entity_id=ev.entity_id, lab_id=lab_id,
                           via_type=ev.related_type, via_id=ev.related_id, granted_by=user_id))
        back = "share_opened"
    else:
        await db.execute(delete(RecordShare).where(
            RecordShare.entity_type == ev.entity_type, RecordShare.entity_id == ev.entity_id, RecordShare.lab_id == lab_id,
            RecordShare.via_type == ev.related_type, RecordShare.via_id == ev.related_id))
        back = "share_closed"
    await emit_event(db, type=back, actor_id=user_id, entity_type=ev.entity_type, entity_id=ev.entity_id,
                     related_type=ev.related_type, related_id=ev.related_id, lab_id=None, visibility="private",
                     meta={"share_lab_id": lab_id, "reverts_event_id": ev.id})
    return ev.entity_type, ev.entity_id, ev.related_type, ev.related_id
