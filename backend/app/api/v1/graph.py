from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, and_
from app.db.session import get_db
from app.core.deps import get_current_user, get_current_user_optional
from app.models.user import User
from app.models.social import LabMember
from app.models.entities import (
    Hypothesis, Observation, Prediction, Worldview,
    Question, ResearchTask, Link, EntityHypothesis
)
from app.core.lab_access import get_entity_for_view, get_entity_for_read, can_read_via_link, opened_via_link_condition, require_publication_consent, grant_publication, ShareChoice, can_link, get_live, links_alive, not_deleted, parent_alive_subquery, trashed_ids
from app.services.events import emit_event
from app.services.link_mutations import LINK_TYPES, ensure_link_type_allowed, remove_own_links, set_own_link_type  # noqa: F401  (LINK_TYPES — прежний экспорт)
from app.services.link_effect import pair_effect
from typing import Dict, List
from pydantic import Field
from app.schemas._strict import StrictIn, Int32

router = APIRouter(prefix="/graph", tags=["graph"])

TYPE_PREFIX = {
    "hypothesis": "h", "observation": "o", "prediction": "p",
    "worldview": "w", "question": "q", "task": "t",
}


@router.get("/")
async def get_graph(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> Dict:
    uid = user.id
    nodes, edges = [], []

    for h in (await db.execute(select(Hypothesis).where(Hypothesis.user_id == uid, Hypothesis.deleted_at.is_(None)))).scalars():
        nodes.append({"id": f"h_{h.id}", "label": h.name, "type": "hypothesis", "status": h.status, "eid": h.id})

    for o in (await db.execute(select(Observation).where(Observation.user_id == uid, Observation.deleted_at.is_(None)))).scalars():
        nodes.append({"id": f"o_{o.id}", "label": o.title, "date": o.date, "type": "observation", "eid": o.id})

    _preds = (await db.execute(select(Prediction).where(Prediction.user_id == uid, Prediction.deleted_at.is_(None)))).scalars().all()
    _dead_hyps = await trashed_ids(db, Hypothesis, {p.hypothesis_id for p in _preds})
    for p in _preds:
        nodes.append({"id": f"p_{p.id}", "label": (p.text or "")[:60], "type": "prediction", "status": p.status, "eid": p.id})
        if p.hypothesis_id and p.hypothesis_id not in _dead_hyps:
            edges.append({"from": f"p_{p.id}", "to": f"h_{p.hypothesis_id}"})

    for w in (await db.execute(select(Worldview).where(Worldview.user_id == uid, Worldview.deleted_at.is_(None)))).scalars():
        nodes.append({"id": f"w_{w.id}", "label": (w.belief or "")[:60], "type": "worldview", "status": w.status, "eid": w.id})

    for q in (await db.execute(select(Question).where(Question.user_id == uid, Question.deleted_at.is_(None)))).scalars():
        nodes.append({"id": f"q_{q.id}", "label": q.title, "type": "question", "status": q.status, "eid": q.id})

    for t in (await db.execute(select(ResearchTask).where(ResearchTask.user_id == uid, ResearchTask.deleted_at.is_(None)))).scalars():
        nodes.append({"id": f"t_{t.id}", "label": t.name, "type": "task", "status": t.status, "eid": t.id})

    for lnk in (await db.execute(select(Link).where(Link.user_id == uid, links_alive()))).scalars():
        f = TYPE_PREFIX.get(lnk.from_type, lnk.from_type[0])
        t = TYPE_PREFIX.get(lnk.to_type, lnk.to_type[0])
        edges.append({"from": f"{f}_{lnk.from_id}", "to": f"{t}_{lnk.to_id}", "link_type": lnk.link_type})

    for th in (await db.execute(
        select(EntityHypothesis).join(ResearchTask, ResearchTask.id == EntityHypothesis.parent_id)
        .where(EntityHypothesis.parent_type == "task", ResearchTask.user_id == uid,
                ResearchTask.deleted_at.is_(None),
                parent_alive_subquery("hypothesis", EntityHypothesis.hypothesis_id))
    )).scalars():
        edges.append({"from": f"t_{th.parent_id}", "to": f"h_{th.hypothesis_id}", "link_type": "связано"})

    return {"nodes": nodes, "edges": edges}


@router.get("/lab/{lab_id}")
async def get_lab_graph(lab_id: int, include_opened: bool = False, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> Dict:
    """Граф лаборатории — те же узлы/формы/цвета, что и в личном графе,
    но область данных — сущности конкретной лаборатории, а не одного автора."""
    from fastapi import HTTPException
    from app.models.social import Lab, LabMember

    lab = await db.get(Lab, lab_id)
    member = await db.scalar(select(LabMember).where(LabMember.lab_id == lab_id, LabMember.user_id == user.id))
    if not lab or (not lab.is_public and not member):
        raise HTTPException(403, "Нет доступа")

    nodes, edges = [], []

    # Гипотезы: прямой lab_id (предложенные/лабораторные) + конкурирующие
    # по цели через EntityHypothesis (та же логика, что LabHypothesesRail
    # и счётчик "N гипотез" в labs.py — иначе граф лабы не совпадает с тем,
    # что видит пользователь в остальном интерфейсе).
    hyp_ids_seen: set[int] = set()
    for h in (await db.execute(select(Hypothesis).where(Hypothesis.lab_id == lab_id, Hypothesis.deleted_at.is_(None)))).scalars():
        nodes.append({"id": f"h_{h.id}", "label": h.name, "type": "hypothesis", "status": h.status, "eid": h.id})
        hyp_ids_seen.add(h.id)
    if lab.goal_type and lab.goal_id:
        goal_hyp_ids = (await db.execute(
            select(EntityHypothesis.hypothesis_id).where(
                EntityHypothesis.parent_type == lab.goal_type,
                EntityHypothesis.parent_id == lab.goal_id,
            )
        )).scalars().all()
        for h in (await db.execute(select(Hypothesis).where(Hypothesis.id.in_(goal_hyp_ids), Hypothesis.deleted_at.is_(None)))).scalars():
            if h.id in hyp_ids_seen:
                continue
            nodes.append({"id": f"h_{h.id}", "label": h.name, "type": "hypothesis", "status": h.status, "eid": h.id})
            hyp_ids_seen.add(h.id)

    for o in (await db.execute(select(Observation).where(Observation.lab_id == lab_id, Observation.deleted_at.is_(None)))).scalars():
        nodes.append({"id": f"o_{o.id}", "label": o.title, "date": o.date, "type": "observation", "eid": o.id})

    _preds = (await db.execute(select(Prediction).where(Prediction.lab_id == lab_id, Prediction.deleted_at.is_(None)))).scalars().all()
    _dead_hyps = await trashed_ids(db, Hypothesis, {p.hypothesis_id for p in _preds})
    for p in _preds:
        nodes.append({"id": f"p_{p.id}", "label": (p.text or "")[:60], "type": "prediction", "status": p.status, "eid": p.id})
        if p.hypothesis_id and p.hypothesis_id not in _dead_hyps:
            edges.append({"from": f"p_{p.id}", "to": f"h_{p.hypothesis_id}"})

    for w in (await db.execute(select(Worldview).where(Worldview.lab_id == lab_id, Worldview.deleted_at.is_(None)))).scalars():
        nodes.append({"id": f"w_{w.id}", "label": (w.belief or "")[:60], "type": "worldview", "status": w.status, "eid": w.id})

    for q in (await db.execute(select(Question).where(Question.lab_id == lab_id, Question.deleted_at.is_(None)))).scalars():
        nodes.append({"id": f"q_{q.id}", "label": q.title, "type": "question", "status": q.status, "eid": q.id})

    # Записи, открытые лаборатории владельцами через связь (record_shares): только по запросу, с пометкой opened.
    # lab_id у них пуст, поэтому в сигнал лаборатории они не входят; зритель обязан быть участником (см. условие).
    if include_opened:
        label_of = {"observation": lambda o: o.title, "hypothesis": lambda o: o.name, "prediction": lambda o: (o.text or "")[:60],
                    "worldview": lambda o: (o.belief or "")[:60], "question": lambda o: o.title}
        have = {n["id"] for n in nodes}
        for otype, omodel in (("observation", Observation), ("hypothesis", Hypothesis), ("prediction", Prediction),
                              ("worldview", Worldview), ("question", Question)):
            for o in (await db.execute(select(omodel).where(opened_via_link_condition(omodel, otype, user.id, lab_id)))).scalars():
                key = f"{TYPE_PREFIX[otype]}_{o.id}"
                if key in have:
                    continue
                have.add(key)
                node = {"id": key, "label": label_of[otype](o), "type": otype, "eid": o.id, "opened": True}
                if getattr(o, "status", None) is not None:
                    node["status"] = o.status
                if otype == "observation":
                    node["date"] = o.date
                nodes.append(node)
                if otype == "prediction" and o.hypothesis_id and f"h_{o.hypothesis_id}" in have:
                    edges.append({"from": key, "to": f"h_{o.hypothesis_id}"})

    # связи не привязаны к lab_id напрямую (Link принадлежит автору связи, не лабе) —
    # берём только те, у которых ОБЕ стороны попали в набор узлов лабы.
    node_ids = {n["id"] for n in nodes}
    for lnk in (await db.execute(select(Link).where(links_alive()))).scalars():
        f = TYPE_PREFIX.get(lnk.from_type, lnk.from_type[0])
        t = TYPE_PREFIX.get(lnk.to_type, lnk.to_type[0])
        fk, tk = f"{f}_{lnk.from_id}", f"{t}_{lnk.to_id}"
        if fk in node_ids and tk in node_ids:
            edges.append({"from": fk, "to": tk, "link_type": lnk.link_type})

    return {"nodes": nodes, "edges": edges}


async def _is_lab_participant(db, lab_id, user_id: int) -> bool:
    """Участник или владелец лаборатории: чья связь наблюдения с гипотезой лаборатории двигает её предложение."""
    if not lab_id:
        return False
    from app.models.social import Lab, LabMember
    if await db.scalar(select(LabMember.user_id).where(LabMember.lab_id == lab_id, LabMember.user_id == user_id)) is not None:
        return True
    return await db.scalar(select(Lab.id).where(Lab.id == lab_id, Lab.owner_id == user_id)) is not None


async def _recompute_if_observation_hypothesis_link(
    db: AsyncSession, from_type: str, from_id: int, to_type: str, to_id: int, user_id: int,
):
    """Наблюдение и прогноз влияют на значимость гипотезы одним и тем же
    путём (hypothesis_evidence.recompute_suggestion). Прогноз запускает
    пересчёт при закрытии (process_prediction_close); связь наблюдения с
    гипотезой раньше пересчёт не триггерила вообще — предложение по
    зрелости обновлялось только "случайно", при следующем закрытии
    какого-нибудь прогноза. Явно запускаем пересчёт здесь же, сразу при
    добавлении/удалении связи, если она связывает observation и hypothesis
    (в любую сторону — Link не гарантирует, кто from, а кто to)."""
    types = {from_type, to_type}
    if types != {"observation", "hypothesis"}:
        return
    hyp_id = from_id if from_type == "hypothesis" else to_id
    hyp = await get_live(db, Hypothesis, hyp_id)
    if hyp and (hyp.user_id == user_id or await _is_lab_participant(db, hyp.lab_id, user_id)):
        from app.services.hypothesis_evidence import recompute_suggestion
        from app.services.evidence_diversity import invalidate_evidence_diversity
        await recompute_suggestion(db, hyp)
        invalidate_evidence_diversity(hyp)  # новое подтверждение/опровержение — кэш индекса устарел
        await db.commit()


ENTITY_MODELS_FOR_LINKS = {
    "observation": Observation, "hypothesis": Hypothesis, "prediction": Prediction,
    "worldview": Worldview, "question": Question, "task": ResearchTask,
}


@router.post("/links")
async def add_link(
    from_type: str, from_id: int, to_type: str, to_id: int,
    link_type: str = Query("related", max_length=64),  # колонка link_type — String(64)
    share: ShareChoice = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Связывать можно только то, что видишь — не вслепую по id чужой приватной
    # записи. Минимальный порог: get_entity_for_view (владелец/лаба/публичное),
    # не полное владение — создание связи не требует прав на редактирование.
    for t, i in ((from_type, from_id), (to_type, to_id)):
        model = ENTITY_MODELS_FOR_LINKS.get(t)
        if model is None:
            raise HTTPException(400, f"Неизвестный тип сущности: {t}")
        await can_link(db, model, i, user.id)

    ensure_link_type_allowed(from_type, to_type, link_type)

    from_model = ENTITY_MODELS_FOR_LINKS[from_type]
    to_model = ENTITY_MODELS_FOR_LINKS[to_type]
    from_obj = await db.get(from_model, from_id)
    to_obj = await db.get(to_model, to_id)
    # lab-контекст события = сторона, принадлежащая автору связи; если ни одна
    # сторона не его (связал две чужие/публичные записи — can_link это разрешает),
    # берём любую непустую lab_id, иначе остаёмся приватными — тот же принцип,
    # что и в backfill-миграции для исторических связей.
    if from_obj and from_obj.user_id == user.id:
        ev_lab_id, ev_visibility = from_obj.lab_id, from_obj.visibility
    elif to_obj and to_obj.user_id == user.id:
        ev_lab_id, ev_visibility = to_obj.lab_id, to_obj.visibility
    else:
        ev_lab_id = (from_obj.lab_id if from_obj else None) or (to_obj.lab_id if to_obj else None)
        ev_visibility = "lab" if ev_lab_id else "private"

    # связь может открыть приватную запись лаборатории: без согласия владельца 409 needs_consent
    impacts = await require_publication_consent(db, (from_type, from_obj), (to_type, to_obj), user.id, share)
    await grant_publication(db, impacts, user.id)
    lnk = Link(user_id=user.id, from_type=from_type, from_id=from_id,
                to_type=to_type, to_id=to_id, link_type=link_type)
    # Дубль связи (IntegrityError) откатывает только savepoint: строка согласия (record_shares), выбранная этим запросом, остаётся.
    from sqlalchemy.exc import IntegrityError
    # Пара записей не направлена (так ее меняют и удаляют), а уникальный ключ таблицы учитывает направление:
    # зеркальную связь отсекаем здесь и отвечаем как на прямой дубль. Два одновременных запроса это не закрывает.
    mirrored = await db.scalar(select(Link.id).where(
        Link.user_id == user.id, Link.from_type == to_type, Link.from_id == to_id,
        Link.to_type == from_type, Link.to_id == from_id).limit(1))
    if mirrored is None:
        created = True
        try:
            async with db.begin_nested():
                db.add(lnk)
                await emit_event(db, type="linked", actor_id=user.id, entity_type=from_type,
                          entity_id=from_id, related_type=to_type, related_id=to_id,
                          lab_id=ev_lab_id, visibility=ev_visibility, meta={"link_type": link_type})
        except IntegrityError:
            created = False
    else:
        created = False
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        return {"ok": True}
    if created:
        await _recompute_if_observation_hypothesis_link(db, from_type, from_id, to_type, to_id, user.id)
    return {"ok": True}


@router.delete("/links")
async def remove_link(
    from_type: str, from_id: int, to_type: str, to_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Удаляет СВОЮ связь между двумя записями в любом направлении и пишет событие unlinked (по нему
    связь можно вернуть откатом). removed — сколько связей удалено: 0 значит, что связи нет, она задана
    в самой записи или принадлежит другому автору."""
    removed = await remove_own_links(db, user.id, (from_type, from_id), (to_type, to_id))
    await db.commit()
    await _recompute_if_observation_hypothesis_link(db, from_type, from_id, to_type, to_id, user.id)
    return {"ok": True, "removed": removed}


@router.put("/links")
async def update_link_type(
    from_type: str, from_id: int, to_type: str, to_id: int, link_type: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Смена типа существующей связи одним запросом: только автор связи, в любом направлении,
    с событием link_type_changed (old/new) для отката."""
    await set_own_link_type(db, user.id, (from_type, from_id), (to_type, to_id), link_type)
    await db.commit()
    await _recompute_if_observation_hypothesis_link(db, from_type, from_id, to_type, to_id, user.id)
    return {"ok": True}


RELATED_MODEL_MAP = {
    "hypothesis":  (Hypothesis,  lambda x: {"title": x.name,    "status": x.status}),
    "observation": (Observation, lambda x: {"title": x.title, "status": None, "date": x.date}),
    "prediction":  (Prediction,  lambda x: {"title": x.title or x.text[:80], "status": x.status, "date": x.expected_check_date}),
    "question":    (Question,    lambda x: {"title": x.title,   "status": x.status}),
    "worldview":   (Worldview,   lambda x: {"title": x.belief[:80], "status": x.status}),
    "task":        (ResearchTask,lambda x: {"title": x.name,    "status": x.status}),
}


@router.get("/related/{entity_type}/{entity_id}")
async def get_related(
    entity_type: str,
    entity_id: int,
    user: User | None = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    """Все связанные сущности для конкретной записи — обход графа (BFS) на
    глубину до MAX_DEPTH хопов по трём источникам рёбер: Link (произвольные
    связи), EntityHypothesis (конкурирующие гипотезы) и Prediction.hypothesis_id
    (жёсткая FK-связь прогноз->гипотеза). Каждое ребро неориентированное.
    Для каждого найденного узла запоминается родитель (через какой узел до
    него дошли при обходе) и тип ребра — так фронтенд строит дерево вместо
    плоской звезды от центра, независимо от того, какого типа промежуточные
    сущности стоят на пути (гипотеза, вопрос, задача и т.д.).

    Видимость: раньше BFS строился по ВСЕМ рёбрам без учёта visibility, а
    фильтр применялся только к финальному списку — приватная чужая сущность
    могла служить мостом между двумя видимыми узлами, транзитом протаскивая
    связь через неё, и сам корневой entity_id вообще не проверялся на
    доступность запрашивающему. Теперь: (1) корень проверяется через
    get_entity_for_view до начала обхода — как при прямом просмотре записи;
    (2) видимость проверяется НА КАЖДОМ узле в момент посещения BFS, а не
    только на выходе — невидимый узел не считается достигнутым и не
    используется как мост дальше по графу. См. ACCESS_POLICY.md — это
    четвёртый по счёту механизм связности в проекте (наряду с
    can_link/entity_visibility_filter/opened_via_link_condition); однохоповое
    правило "связь = осознанная публикация" здесь не применялось никогда —
    сузили до того же принципа: видимый узел не даёт видимости всему, что
    за ним."""
    if entity_type not in RELATED_MODEL_MAP:
        raise HTTPException(400, "Неизвестный тип сущности")
    uid = user.id if user else None   # гость (uid=None): тот же обход, но только публичное и без управления связями
    MAX_DEPTH = 5

    root_model, _ = RELATED_MODEL_MAP[entity_type]
    root_obj = await get_entity_for_read(db, root_model, entity_id, uid)
    from app.core.prediction_status import CLOSED_PREDICTION_STATUSES

    edges: dict[tuple, list[tuple]] = {}
    def add_edge(a, b, ltype, meta=None):
        meta = meta or {"source": "field", "own": False}
        edges.setdefault(a, []).append((b, ltype, meta))
        edges.setdefault(b, []).append((a, ltype, meta))

    loaded_edges: set = set()

    async def load_edges(nodes):
        """Рёбра, у которых хотя бы один конец среди nodes: один слой обхода вместо чтения всех связей платформы
        (стоимость зависит от окрестности записи, а не от чужих данных). Порядок как раньше: связи, конкурирующие, FK."""
        from sqlalchemy import and_ as _a, or_ as _o
        by_type: dict[str, set[int]] = {}
        for t_, i_ in nodes:
            by_type.setdefault(t_, set()).add(i_)
        if not by_type:
            return
        touch = [_a(Link.from_type == t_, Link.from_id.in_(ids_)) for t_, ids_ in by_type.items()]
        touch += [_a(Link.to_type == t_, Link.to_id.in_(ids_)) for t_, ids_ in by_type.items()]
        for lnk in (await db.execute(select(Link).where(_o(*touch), links_alive()).order_by(Link.id))).scalars():
            if ("link", lnk.id) in loaded_edges:
                continue
            loaded_edges.add(("link", lnk.id))
            add_edge((lnk.from_type, lnk.from_id), (lnk.to_type, lnk.to_id), lnk.link_type, {"source": "link", "own": lnk.user_id == uid, "by": lnk.user_id, "at": lnk.created_at})
        hyp_ids = by_type.get("hypothesis", set())
        eh_touch = [_a(EntityHypothesis.parent_type == t_, EntityHypothesis.parent_id.in_(ids_)) for t_, ids_ in by_type.items()]
        if hyp_ids:
            eh_touch.append(EntityHypothesis.hypothesis_id.in_(hyp_ids))
        for eh in (await db.execute(select(EntityHypothesis).where(
            _o(*eh_touch),
            parent_alive_subquery(EntityHypothesis.parent_type, EntityHypothesis.parent_id),
            parent_alive_subquery("hypothesis", EntityHypothesis.hypothesis_id)))).scalars():
            key = ("competing", eh.parent_type, eh.parent_id, eh.hypothesis_id)
            if key in loaded_edges:
                continue
            loaded_edges.add(key)
            add_edge((eh.parent_type, eh.parent_id), ("hypothesis", eh.hypothesis_id), "конкурирующая гипотеза", {"source": "competing", "own": False, "role": eh.role, "stance": eh.stance})
        pred_touch = []
        if by_type.get("prediction"):
            pred_touch.append(Prediction.id.in_(by_type["prediction"]))
        if hyp_ids:
            pred_touch.append(Prediction.hypothesis_id.in_(hyp_ids))
        if pred_touch:
            for pid, hid in (await db.execute(
                select(Prediction.id, Prediction.hypothesis_id).where(
                    _o(*pred_touch),
                    Prediction.hypothesis_id.is_not(None), Prediction.deleted_at.is_(None),
                    parent_alive_subquery("hypothesis", Prediction.hypothesis_id)))).all():
                if ("fk", pid) in loaded_edges:
                    continue
                loaded_edges.add(("fk", pid))
                add_edge(("prediction", pid), ("hypothesis", hid), "прогноз")

    member_lab_ids = [] if uid is None else (await db.execute(
        select(LabMember.lab_id).where(LabMember.user_id == uid))).scalars().all()

    async def _visible(ntype: str, nid: int):
        """(obj, serializer) если узел виден uid, иначе None — общий критерий
        и для прохода BFS, и для сериализации, нет рассинхрона между тем, что
        обошли, и тем, что показали."""
        if ntype not in RELATED_MODEL_MAP:
            return None
        model, serializer = RELATED_MODEL_MAP[ntype]
        obj = await get_live(db, model, nid)
        if not obj:
            return None
        is_owner = uid is not None and getattr(obj, "user_id", uid) == uid   # гость никому не владелец
        is_public = getattr(obj, "visibility", None) == "public"
        # через лабораторию видно только то, что отдано лаборатории (visibility=lab); приватная запись с lab_id не в счёт
        is_lab = getattr(obj, "visibility", None) == "lab" and getattr(obj, "lab_id", None) and obj.lab_id in member_lab_ids
        if not (is_owner or is_public or is_lab) and (uid is None or not await can_read_via_link(db, model, nid, uid)):
            return None  # ни строгого доступа, ни «открыта через связь»
        return obj, serializer

    # BFS от корневой сущности; узел добавляется в visited (и используется
    # дальше как мост) только если он виден uid — root уже прошёл проверку
    # доступа выше через get_entity_for_view.
    root = (entity_type, entity_id)
    visited: dict[tuple, dict] = {root: {"parent": None, "link_type": None, "meta": None}}
    node_cache: dict[tuple, tuple] = {}
    frontier = [root]
    for _ in range(MAX_DEPTH):
        await load_edges(frontier)
        next_frontier = []
        for node in frontier:
            for neighbor, ltype, meta in edges.get(node, ()):
                if neighbor in visited:
                    continue
                ntype, nid = neighbor
                resolved = await _visible(ntype, nid)
                if resolved is None:
                    continue
                node_cache[neighbor] = resolved
                visited[neighbor] = {"parent": node, "link_type": ltype, "meta": meta}
                next_frontier.append(neighbor)
        frontier = next_frontier
        if not frontier:
            break

    # кто связал: для строк links — их автор, для связи из поля — владелец прогноза; у конкурирующих данных нет
    from app.models.user import User as _U
    _ids = {i["meta"].get("by") for i in visited.values() if i["meta"]} | {getattr(o, "user_id", None) for o, _s in node_cache.values()} | {getattr(root_obj, "user_id", None)}
    _users = {u.id: u for u in (await db.execute(select(_U).where(_U.id.in_([x for x in _ids if x])))).scalars()}
    def _who(uid_):
        u = _users.get(uid_)
        return {"username": u.username, "display_name": u.display_name} if u else None
    grouped: dict[str, list] = {}
    _obs_cache: dict[int, dict[int, float]] = {}
    # «Открыто лаборатории X»: согласия, выданные самим зрителем, для связей этой записи (чужие не видны никому, кроме автора)
    from app.models.entities import RecordShare as _RS
    from app.models.social import Lab as _Lab
    _my_shares = [] if uid is None else (await db.execute(select(_RS, _Lab.name).join(_Lab, _Lab.id == _RS.lab_id).where(_RS.granted_by == uid))).all()
    for (ntype, nid), info in visited.items():
        if (ntype, nid) == root:
            continue
        obj, serializer = node_cache[(ntype, nid)]
        parent = info["parent"]
        has_parent = parent is not None and parent != root
        item = {
            "id": nid, "type": ntype, "link_type": info["link_type"],
            "parent_type": parent[0] if has_parent else None,
            "parent_id": parent[1] if has_parent else None,
            "is_own": getattr(obj, "user_id", None) == uid,
            # direct: связь с этой записью напрямую, а не через промежуточную; can_edit: это моя строка Link
            "direct": not has_parent,
            "source": info["meta"]["source"],
            **({"role": info["meta"].get("role"), "stance": info["meta"].get("stance")} if info["meta"]["source"] == "competing" else {}),
            "can_edit": (not has_parent) and (
                (info["meta"]["source"] == "link" and info["meta"]["own"])
                or (info["meta"]["source"] == "competing"
                    and getattr(obj if ntype in ("task", "question") else root_obj, "user_id", None) == uid)),
            **serializer(obj),
        }
        # capabilities: что с этой связью можно делать (интерфейс рисует управление по этому списку)
        src, caps = info["meta"]["source"], []
        if item["direct"] and src == "link" and info["meta"]["own"]:
            caps = ["remove", "set_type"]
        elif item["direct"] and src == "competing" and item["can_edit"]:
            caps = ["remove", "set_role", "set_stance"]
        elif item["direct"] and src == "field":
            pred = obj if ntype == "prediction" else root_obj
            item["stance"] = "подтверждает" if pred.confirms_hypothesis_if_true else "опровергает"
            if getattr(pred, "user_id", None) == uid and pred.status not in CLOSED_PREDICTION_STATUSES:
                caps = ["remove", "set_type"]
        item["capabilities"] = caps
        if item["direct"]:
            item["shared_with"] = [
                {"share_id": sh.id, "lab_id": sh.lab_id, "lab_name": lab_name, "entity_type": sh.entity_type, "entity_id": sh.entity_id} for sh, lab_name in _my_shares
                if ((sh.entity_type, sh.entity_id, sh.via_type, sh.via_id) == (ntype, nid, root[0], root[1])
                    or (sh.entity_type, sh.entity_id, sh.via_type, sh.via_id) == (root[0], root[1], ntype, nid))]
        # lock: почему у прямой связи нет управления (интерфейс показывает причину, а не молчит)
        lock = None
        if item["direct"] and not caps:
            if src == "field":
                fpred = obj if ntype == "prediction" else root_obj
                if getattr(fpred, "user_id", None) != uid:
                    lock = {"code": "other_author"}
                elif fpred.status in CLOSED_PREDICTION_STATUSES:
                    lock = {"code": "pred_closed", "status": fpred.status}
            elif src in ("link", "competing"):
                lock = {"code": "other_author"}
        item["lock"] = lock
        if src == "link":
            item["linked_by"] = _who(info["meta"].get("by"))
            at = info["meta"].get("at")
            item["linked_at"] = at.isoformat() if at else None
        elif src == "field":
            item["linked_by"] = _who((obj if ntype == "prediction" else root_obj).user_id)
            item["linked_at"] = None
        else:
            item["linked_by"], item["linked_at"] = None, None
        # effect: что эта связь вносит в сигнал гипотезы (только владельцу гипотезы, см. services/link_effect.py)
        item["effect"] = None
        if item["direct"] and src in ("link", "field"):
            if entity_type == "hypothesis":
                e_hyp, e_type, e_other = root_obj, ntype, obj
            elif ntype == "hypothesis":
                e_hyp, e_type, e_other = obj, entity_type, root_obj
            else:
                e_hyp = None
            if e_hyp is not None and uid is not None:
                item["effect"] = await pair_effect(db, uid, e_hyp, e_type, e_other, _obs_cache)
        grouped.setdefault(ntype, []).append(item)

    # Упоминания в тексте (не связи): другой конец показываем, только если его пропускает тот же _visible, что и обход графа;
    # дубль с прямым ребром (связь, конкурирующая, FK прогноза) скрыт; запись в нескольких полях: одна строка с полями.
    from app.models.entities import EntityMention as _EM
    from sqlalchemy import and_ as _and, or_ as _or
    direct_ends = {n for n, _l, _m in edges.get(root, ())}
    m_rows = (await db.execute(select(_EM).where(_or(
        _and(_EM.source_type == entity_type, _EM.source_id == entity_id),
        _and(_EM.target_type == entity_type, _EM.target_id == entity_id))).order_by(_EM.id))).scalars().all()
    mention_out: dict[str, dict[tuple, dict]] = {"mentions": {}, "mentioned_in": {}}
    for m in m_rows:
        key, other = (("mentions", (m.target_type, m.target_id)) if (m.source_type, m.source_id) == root
                      else ("mentioned_in", (m.source_type, m.source_id)))
        if other == root or other in direct_ends:
            continue
        if other in mention_out[key]:
            mention_out[key][other]["fields"].append(m.field)
            continue
        resolved = node_cache.get(other) or await _visible(*other)
        if resolved is None:
            continue
        obj, serializer = resolved
        mention_out[key][other] = {"id": other[1], "type": other[0], "fields": [m.field],
                                   "is_own": getattr(obj, "user_id", None) == uid, **serializer(obj)}
    mentions = {k: list(v.values()) for k, v in mention_out.items()}

    return {"entity_type": entity_type, "entity_id": entity_id, "related": grouped, "mentions": mentions}


@router.get("/search")
async def search_entities(
    q: str,
    exclude_type: str = "",
    exclude_id: int = 0,
    only_type: str = "",
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Поиск сущностей для LinkModal.

    Фильтр по подстроке идёт в Python: на каждый тип загружаются все видимые зрителю записи (2 запроса при любом размере).
    Замер: 500 записей по 4 КБ ≈ 0,04 с, 5000 ≈ 0,11 с. Порог ≈ 20 000 видимых записей одного типа ≈ 0,5 с (экстраполяция
    замера). За порогом фильтр переносится в SQL: регистр кириллицы (локаль БД), экранирование % и _, заголовок
    title или text[:80]. Решение Алексея 2026-11-04: до порога не трогаем."""
    uid = user.id
    q = q.strip().lower()
    only_type = only_type.strip().lower()
    results = []
    # Лимит на ТИП, а не на весь список: иначе первые типы вытесняют остальные при поиске без only_type.
    per_type = 30 if only_type else 8

    async def search_model(model, type_name, get_title, get_status=None, own_only=False):
        # Свои + лабораторные записи коллег + публичные (то, что зритель вправе видеть и привязать); открытые через
        # связь не берём: can_link строгий, привязать их нельзя.
        from app.core.lab_access import entity_visibility_filter
        # own_only: типы, у которых чужие записи в окне связей не ищем (убеждения, решение Алексея).
        visible = (model.user_id == uid) if own_only else entity_visibility_filter(model, uid)
        rows = (await db.execute(
            select(model).where(visible, not_deleted(model)).order_by(model.id.desc())
        )).scalars().all()
        found = 0
        for row in rows:
            title = get_title(row)
            if q in title.lower():
                if exclude_type == type_name and exclude_id == row.id:
                    continue
                if found >= per_type:
                    break
                found += 1
                results.append({
                    "id": row.id, "type": type_name, "title": title[:100],
                    "status": get_status(row) if get_status else None,
                    "is_own": row.user_id == uid,
                })

    if not only_type or only_type == "hypothesis":
        await search_model(Hypothesis,   "hypothesis",  lambda x: x.name,          lambda x: x.status)
    if not only_type or only_type == "observation":
        await search_model(Observation,  "observation", lambda x: x.title or x.text[:80])
    if not only_type or only_type == "prediction":
        await search_model(Prediction,   "prediction",  lambda x: x.title or x.text[:80], lambda x: x.status)
    if not only_type or only_type == "question":
        await search_model(Question,     "question",    lambda x: x.title,          lambda x: x.status)

    if not only_type or only_type == "task":
        await search_model(ResearchTask, "task", lambda x: x.name, lambda x: x.status)
    # Убеждения только по явному only_type: у них свой словарь типов связи (влияние), общие окна его не знают
    if only_type == "worldview":
        await search_model(Worldview, "worldview", lambda x: x.belief, lambda x: x.status, own_only=True)

    return results


class WhatIfIn(StrictIn):
    exclude_observation_ids: List[Int32] = Field(default=[], max_length=1000)


def _what_if_rows(hyps, evidence_by_hyp, exclude, viewer_id, visible_obs_ids, long_ids=False) -> list:
    """Владелец гипотезы видит полный расчёт. Остальные (глобальный граф, участники лаборатории) видят
    только сдвиг сигнала от наблюдений из visible_obs_ids: уровень и абсолютный сигнал зависят от скрытого
    (evidence_signal включает закрытые прогнозы автора), поэтому их не показываем."""
    from app.services.hypothesis_evidence import what_if, what_if_delta, load_bearing
    nid = (lambda t, i: f"{t}_{i}") if long_ids else (lambda t, i: f"{TYPE_PREFIX[t]}_{i}")
    out = []
    for h in hyps:
        evidence = evidence_by_hyp.get(h.id, [])
        owner = h.user_id == viewer_id
        if not owner:
            evidence = [e for e in evidence if e[0] in visible_obs_ids]
        if not evidence:
            continue
        base = {"node_id": nid("hypothesis", h.id), "eid": h.id, "name": h.name,
                "observation_count": len(evidence), "full": owner}
        if owner:
            out.append({**base, **what_if(h.evidence_signal, h.risk, evidence, exclude),
                        "load_bearing": [nid("observation", oid) for oid in load_bearing(h.evidence_signal, h.risk, evidence)]})
        else:
            out.append({**base, **what_if_delta(evidence, exclude), "verdict": "unknown",
                        "level_before": None, "level_after": None, "load_bearing": []})
    return out


@router.post("/what-if")
async def what_if_graph(body: WhatIfIn, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> Dict:
    """Режим «а что, если эти наблюдения неверны» для личного графа: как изменится уровень зрелости
    каждой гипотезы по расчёту платформы. Ничего не пишет. Прогнозы не пересчитываются: их вклад
    влит в evidence_signal. Без исключений все вердикты held, а load_bearing показывает хрупкие места."""
    from app.services.hypothesis_evidence import observation_evidence_bulk, what_if, load_bearing
    exclude = set(body.exclude_observation_ids)
    hyps = (await db.execute(select(Hypothesis).where(
        Hypothesis.user_id == user.id, Hypothesis.deleted_at.is_(None)))).scalars().all()
    evidence_by_hyp = await observation_evidence_bulk(db, hyps)
    return {"hypotheses": _what_if_rows(hyps, evidence_by_hyp, exclude, user.id, set())}


@router.post("/lab/{lab_id}/what-if")
async def what_if_lab_graph(lab_id: int, body: WhatIfIn, user: User = Depends(get_current_user),
                            db: AsyncSession = Depends(get_db)) -> Dict:
    """«А что, если» для графа лаборатории. Считается ТОЛЬКО по данным, видимым в лаборатории:
    гипотезы с lab_id этой лабы и наблюдения с lab_id этой лабы. Приватные наблюдения владельца и
    гипотезы, попавшие в граф через цель лаборатории, не участвуют: иначе уровень и load_bearing
    выдали бы скрытое. Доступ как у get_lab_graph."""
    from app.models.social import Lab
    from app.services.hypothesis_evidence import observation_evidence_bulk
    lab = await db.get(Lab, lab_id)
    member = await db.scalar(select(LabMember).where(LabMember.lab_id == lab_id, LabMember.user_id == user.id))
    if not lab or (not lab.is_public and not member):
        raise HTTPException(403, "Нет доступа")
    hyps = (await db.execute(select(Hypothesis).where(
        Hypothesis.lab_id == lab_id, Hypothesis.deleted_at.is_(None)))).scalars().all()
    lab_obs = set((await db.execute(select(Observation.id).where(
        Observation.lab_id == lab_id, Observation.deleted_at.is_(None)))).scalars().all())
    bulk = await observation_evidence_bulk(db, hyps)
    return {"hypotheses": _what_if_rows(hyps, bulk, set(body.exclude_observation_ids), user.id, lab_obs), "scope": "lab_visible"}


def _link_keys(links) -> list[tuple[str, str]]:
    out = []
    for lnk in links:
        f = TYPE_PREFIX.get(lnk.from_type, lnk.from_type[0])
        t = TYPE_PREFIX.get(lnk.to_type, lnk.to_type[0])
        out.append((f"{f}_{lnk.from_id}", f"{t}_{lnk.to_id}"))
    return out


@router.get("/blind-spots")
async def blind_spots(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> Dict:
    """Слепые зоны личного графа: гипотезы без критериев опровержения / только с подтверждениями / без
    прогнозов, просроченные прогнозы, наблюдения без связей. Только записи пользователя, не в корзине."""
    from datetime import datetime, timezone
    from app.core.prediction_status import OPEN_PREDICTION_STATUS
    from app.services.blind_spots import find_blind_spots
    from app.services.hypothesis_evidence import observation_evidence_bulk
    uid = user.id
    hyps = (await db.execute(select(Hypothesis).where(Hypothesis.user_id == uid, Hypothesis.deleted_at.is_(None)))).scalars().all()
    preds = (await db.execute(select(Prediction).where(Prediction.user_id == uid, Prediction.deleted_at.is_(None)))).scalars().all()
    obs = (await db.execute(select(Observation).where(Observation.user_id == uid, Observation.deleted_at.is_(None)))).scalars().all()
    links = (await db.execute(select(Link).where(Link.user_id == uid, links_alive()))).scalars().all()
    evidence = await observation_evidence_bulk(db, hyps)
    items = find_blind_spots(hyps, preds, obs, _link_keys(links), evidence,
                             datetime.now(timezone.utc), OPEN_PREDICTION_STATUS)
    return {"items": items}


@router.get("/lab/{lab_id}/blind-spots")
async def lab_blind_spots(lab_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> Dict:
    """Слепые зоны графа лаборатории: только записи с lab_id этой лабы, связь считается, если оба её
    конца лежат в лаборатории (приватные записи владельца на результат не влияют). Доступ как у get_lab_graph."""
    from datetime import datetime, timezone
    from app.models.social import Lab
    from app.core.prediction_status import OPEN_PREDICTION_STATUS
    from app.services.blind_spots import find_blind_spots
    from app.services.hypothesis_evidence import observation_evidence_bulk
    lab = await db.get(Lab, lab_id)
    member = await db.scalar(select(LabMember).where(LabMember.lab_id == lab_id, LabMember.user_id == user.id))
    if not lab or (not lab.is_public and not member):
        raise HTTPException(403, "Нет доступа")

    async def alive(model):
        return (await db.execute(select(model).where(model.lab_id == lab_id, model.deleted_at.is_(None)))).scalars().all()

    hyps, preds, obs = await alive(Hypothesis), await alive(Prediction), await alive(Observation)
    keys: set[str] = set()
    for model, typ in ((Hypothesis, "hypothesis"), (Observation, "observation"), (Prediction, "prediction"),
                       (Worldview, "worldview"), (Question, "question")):
        rows = hyps if model is Hypothesis else preds if model is Prediction else obs if model is Observation else await alive(model)
        keys.update(f"{TYPE_PREFIX[typ]}_{r.id}" for r in rows)
    links = (await db.execute(select(Link).where(links_alive()))).scalars().all()
    lab_obs = {o.id for o in obs}
    evidence = {hid: [e for e in ev if e[0] in lab_obs] for hid, ev in (await observation_evidence_bulk(db, hyps)).items()}
    items = find_blind_spots(hyps, preds, obs, _link_keys(links), evidence,
                             datetime.now(timezone.utc), OPEN_PREDICTION_STATUS, node_keys=keys)
    return {"items": items, "scope": "lab_visible"}


@router.post("/global/what-if")
async def what_if_global_graph(body: WhatIfIn, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> Dict:
    """«А что, если» для глобального графа: публичные гипотезы (до 400 новых). Чужие гипотезы: только сдвиг
    сигнала от ПУБЛИЧНЫХ наблюдений. Свои: полный расчёт. Идентификаторы узлов в формате глобального графа."""
    from app.services.hypothesis_evidence import observation_evidence_bulk
    hyps = (await db.execute(select(Hypothesis).where(
        Hypothesis.visibility == "public", Hypothesis.deleted_at.is_(None)
    ).order_by(Hypothesis.created_at.desc()).limit(400))).scalars().all()
    bulk = await observation_evidence_bulk(db, hyps)
    ids = {e[0] for ev in bulk.values() for e in ev}
    public_obs: set[int] = set()
    if ids:
        public_obs = set((await db.execute(select(Observation.id).where(
            Observation.id.in_(ids), Observation.visibility == "public", Observation.deleted_at.is_(None)))).scalars().all())
    return {"hypotheses": _what_if_rows(hyps, bulk, set(body.exclude_observation_ids), user.id, public_obs, long_ids=True),
            "scope": "public"}


@router.get("/global/blind-spots")
async def global_blind_spots(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> Dict:
    """Слепые зоны публичных данных (до 2000 новых записей на тип). Связь считается, только если оба её конца
    публичны: связи с приватными записями не видны, поэтому «нет прогнозов» и «без связей» могут быть завышены."""
    from datetime import datetime, timezone
    from app.core.prediction_status import OPEN_PREDICTION_STATUS
    from app.services.blind_spots import find_blind_spots
    from app.services.hypothesis_evidence import observation_evidence_bulk
    from app.services.repost import ENTITY_MODELS
    rows = {}
    for name, model in ENTITY_MODELS.items():
        rows[name] = (await db.execute(select(model).where(
            model.visibility == "public", model.deleted_at.is_(None)
        ).order_by(model.created_at.desc()).limit(2000))).scalars().all()
    ids_by_type = {n: {r.id for r in rs} for n, rs in rows.items() if rs}
    keys = {f"{TYPE_PREFIX[n]}_{i}" for n, ids in ids_by_type.items() for i in ids}
    links = []
    if ids_by_type:
        links = (await db.execute(select(Link).where(
            or_(*[and_(Link.from_type == t, Link.from_id.in_(ids)) for t, ids in ids_by_type.items()]),
            or_(*[and_(Link.to_type == t, Link.to_id.in_(ids)) for t, ids in ids_by_type.items()]),
            links_alive()))).scalars().all()
    hyps, preds, obs = rows["hypothesis"], rows["prediction"], rows["observation"]
    public_obs = {o.id for o in obs}
    evidence = {hid: [e for e in ev if e[0] in public_obs] for hid, ev in (await observation_evidence_bulk(db, hyps)).items()}
    items = find_blind_spots(hyps, preds, obs, _link_keys(links), evidence,
                             datetime.now(timezone.utc), OPEN_PREDICTION_STATUS, node_keys=keys)
    for it in items:
        it["node_id"] = f"{it['type']}_{it['eid']}"
    return {"items": items, "scope": "public"}
