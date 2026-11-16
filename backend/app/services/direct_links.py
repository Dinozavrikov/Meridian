"""Прямые связи записи для числа «Связей» в карточке предпросмотра.

Считается то же, что показывает менеджер связей (/graph/related, узлы на глубине 1): соседи по строкам Link,
по конкурирующим гипотезам (entity_hypotheses) и по predictions.hypothesis_id. Сосед считается один раз,
удалённые и невидимые зрителю узлы не учитываются. Согласованность с /graph/related держит
tests/test_preview_links_count.py."""
from sqlalchemy import and_, or_, select

from app.core.entity_registry import ENTITY_MODELS
from app.core.lab_access import get_live, links_alive, parent_alive_subquery
from app.models.entities import EntityHypothesis, Link, Prediction
from app.models.social import LabMember


async def count_direct_links(db, viewer_id: int | None, entity_type: str, entity_id: int) -> int:
    root = (entity_type, entity_id)
    found: set[tuple[str, int]] = set()

    for ft, fi, tt, ti in (await db.execute(select(Link.from_type, Link.from_id, Link.to_type, Link.to_id).where(
            links_alive(),
            or_(and_(Link.from_type == entity_type, Link.from_id == entity_id),
                and_(Link.to_type == entity_type, Link.to_id == entity_id))))).all():
        found.add((tt, ti) if (ft, fi) == root else (ft, fi))

    eh_cond = [and_(EntityHypothesis.parent_type == entity_type, EntityHypothesis.parent_id == entity_id)]
    if entity_type == "hypothesis":
        eh_cond.append(EntityHypothesis.hypothesis_id == entity_id)
    for pt, pi, hid in (await db.execute(select(EntityHypothesis.parent_type, EntityHypothesis.parent_id, EntityHypothesis.hypothesis_id).where(
            parent_alive_subquery(EntityHypothesis.parent_type, EntityHypothesis.parent_id),
            parent_alive_subquery("hypothesis", EntityHypothesis.hypothesis_id), or_(*eh_cond)))).all():
        found.add(("hypothesis", hid) if (pt, pi) == root else (pt, pi))

    if entity_type == "prediction":
        for (hid,) in (await db.execute(select(Prediction.hypothesis_id).where(
                Prediction.id == entity_id, Prediction.hypothesis_id.is_not(None),
                parent_alive_subquery("hypothesis", Prediction.hypothesis_id)))).all():
            found.add(("hypothesis", hid))
    elif entity_type == "hypothesis":
        for (pid,) in (await db.execute(select(Prediction.id).where(
                Prediction.hypothesis_id == entity_id, Prediction.deleted_at.is_(None)))).all():
            found.add(("prediction", pid))

    found.discard(root)
    labs = set((await db.execute(select(LabMember.lab_id).where(LabMember.user_id == viewer_id))).scalars().all()) if viewer_id else set()
    n = 0
    for ntype, nid in found:
        model = ENTITY_MODELS.get(ntype)
        obj = await get_live(db, model, nid) if model else None
        if obj is None:
            continue
        if (viewer_id is not None and getattr(obj, "user_id", None) == viewer_id) or getattr(obj, "visibility", None) == "public" \
                or (getattr(obj, "visibility", None) == "lab" and getattr(obj, "lab_id", None) and obj.lab_id in labs):
            n += 1
    return n
