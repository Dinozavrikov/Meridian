"""
Глобальный граф сообщества — только read-only агрегация публичных данных.
Намеренно отделён от graph.py (который целиком приватный, per-user) —
чтобы не смешивать модели доступа и не трогать личный граф.

Масштабирование заложено с самого начала, а не патчится потом:
  1. /global          — суперузлы-агрегаты по типу (константный размер ответа)
  2. /global/expand    — реальные узлы одного типа, с лимитом и сортировкой по свежести

Рёбра приходят из двух принципиально разных мест:
  - таблица Link (гибкие полиморфные связи, которые заводит сам пользователь)
  - "жёсткие" связи, зашитые в схему — прямой FK-столбец (Prediction.hypothesis_id)
    либо отдельная association-таблица (EntityHypothesis для конкурирующих гипотез).
    Они не попадают в Link, поэтому раньше просто не показывались на графе.
    Реестр FK_EDGE_SOURCES ниже — единственное место, которое нужно трогать,
    когда появится новая сущность с подобной жёсткой связью.
"""
from fastapi import APIRouter, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_
from fastapi import Depends
from app.db.session import get_db
from app.models.entities import Observation, Hypothesis, Prediction, Worldview, Question, Link, EntityHypothesis
from app.models.user import User
from app.services.repost import ENTITY_MODELS, extract_content
from app.core.lab_access import get_live, links_alive

router = APIRouter(prefix="/graph", tags=["global-graph"])

EXPAND_LIMIT = 150

def truncate_label(text: str, limit: int) -> str:
    """Обрезает по границе слова, не разрывая слово посередине, добавляет многоточие."""
    text = text.strip()
    if len(text) <= limit:
        return text
    cut = text[:limit]
    last_space = cut.rfind(" ")
    if last_space > limit * 0.4:  # не обрезать до неразумно короткой строки
        cut = cut[:last_space]
    return cut.rstrip(" ,.;:") + "…"


# Реестр жёстких связей между типами сущностей ENTITY_MODELS, не хранящихся в Link.
# kind="column"       — прямой FK-столбец на модели from_type, ссылающийся на to_type.id
# kind="assoc_table"  — отдельная association-таблица с parent_type/parent_id/child_id
FK_EDGE_SOURCES = [
    {
        "from_type": "prediction", "to_type": "hypothesis",
        "link_type": "prediction_of",
        "kind": "column", "column": "hypothesis_id",
    },
    {
        "from_type": "question", "to_type": "hypothesis",
        "link_type": "competing_hypothesis",
        "kind": "assoc_table", "table": EntityHypothesis,
        "parent_type_value": "question",
        "parent_id_col": "parent_id", "child_id_col": "hypothesis_id",
    },
    {
        "from_type": "task", "to_type": "hypothesis",
        "link_type": "competing_hypothesis",
        "kind": "assoc_table", "table": EntityHypothesis,
        "parent_type_value": "task",
        "parent_id_col": "parent_id", "child_id_col": "hypothesis_id",
    },
]


async def fk_edges_within(db: AsyncSession, ids_by_type: dict[str, set[int]]) -> list[tuple[str, str, int, int, str]]:
    """Жёсткие рёбра, обе стороны которых уже входят в ids_by_type (для /global и /global/all)."""
    result = []
    for src in FK_EDGE_SOURCES:
        from_ids = ids_by_type.get(src["from_type"])
        to_ids = ids_by_type.get(src["to_type"])
        if not from_ids or not to_ids:
            continue
        if src["kind"] == "column":
            model = ENTITY_MODELS[src["from_type"]]
            col = getattr(model, src["column"])
            rows = (await db.execute(
                select(model.id, col).where(model.id.in_(from_ids), col.in_(to_ids))
            )).all()
        else:  # assoc_table
            table = src["table"]
            parent_col = getattr(table, src["parent_id_col"])
            child_col = getattr(table, src["child_id_col"])
            rows = (await db.execute(
                select(parent_col, child_col).where(
                    table.parent_type == src["parent_type_value"],
                    parent_col.in_(from_ids), child_col.in_(to_ids),
                )
            )).all()
        for from_id, to_id in rows:
            result.append((src["from_type"], src["to_type"], from_id, to_id, src["link_type"]))
    return result


async def fk_edges_from_entity(db: AsyncSession, entity_type: str, ids: set[int]) -> list[dict]:
    """Жёсткие рёбра для /global/expand — одна сторона (entity_type) уже отобрана,
    другая находится динамически и фильтруется по публичности здесь же."""
    edges = []
    for src in FK_EDGE_SOURCES:
        if src["from_type"] == entity_type:
            other_type, direction = src["to_type"], "forward"
        elif src["to_type"] == entity_type:
            other_type, direction = src["from_type"], "backward"
        else:
            continue
        other_model = ENTITY_MODELS[other_type]

        if src["kind"] == "column":
            if direction == "forward":
                model = ENTITY_MODELS[entity_type]
                col = getattr(model, src["column"])
                rows = (await db.execute(select(model.id, col).where(model.id.in_(ids), col.isnot(None)))).all()
            else:
                owner_model = ENTITY_MODELS[other_type]
                col = getattr(owner_model, src["column"])
                rows = (await db.execute(select(owner_model.id, col).where(col.in_(ids)))).all()
        else:  # assoc_table
            table = src["table"]
            parent_col = getattr(table, src["parent_id_col"])
            child_col = getattr(table, src["child_id_col"])
            if direction == "forward":
                rows = (await db.execute(select(parent_col, child_col).where(
                    table.parent_type == src["parent_type_value"], parent_col.in_(ids)))).all()
            else:
                rows = (await db.execute(select(parent_col, child_col).where(
                    table.parent_type == src["parent_type_value"], child_col.in_(ids)))).all()

        for from_id, to_id in rows:  # обе ветки уже отдают (from, to) в направлении ребра
            from_type, to_type = src["from_type"], src["to_type"]
            other_id = to_id if direction == "forward" else from_id
            other = await get_live(db, other_model, other_id)
            if not other or other.visibility != "public":
                continue
            edges.append({"from": f"{from_type}_{from_id}", "to": f"{to_type}_{to_id}", "link_type": src["link_type"]})
    return edges


@router.get("/global")
async def global_graph_overview(db: AsyncSession = Depends(get_db)):
    """Суперузлы: агрегированное количество публичных сущностей по типу
    + суммарный вес рёбер между каждой парой типов. Размер ответа не растёт с данными."""
    counts = {}
    for name, model in ENTITY_MODELS.items():
        counts[name] = await db.scalar(select(func.count()).where(model.visibility == "public", model.deleted_at.is_(None))) or 0

    public_ids: dict[str, set[int]] = {}
    for name, model in ENTITY_MODELS.items():
        rows = (await db.execute(select(model.id).where(model.visibility == "public", model.deleted_at.is_(None)))).scalars().all()
        public_ids[name] = set(rows)

    edge_weights: dict[tuple[str, str], int] = {}
    all_links = (await db.execute(select(Link.from_type, Link.to_type, Link.from_id, Link.to_id).where(links_alive()))).all()
    all_edges = [(ft, tt, fi, ti) for ft, tt, fi, ti in all_links]
    all_edges += [(ft, tt, fi, ti) for ft, tt, fi, ti, _lt in await fk_edges_within(db, public_ids)]

    for from_type, to_type, from_id, to_id in all_edges:
        if from_type not in public_ids or to_type not in public_ids:
            continue
        if from_id not in public_ids[from_type] or to_id not in public_ids[to_type]:
            continue
        key = tuple(sorted([from_type, to_type]))
        edge_weights[key] = edge_weights.get(key, 0) + 1

    return {
        "supernodes": [{"type": t, "count": c} for t, c in counts.items() if c > 0],
        "superedges": [{"from": a, "to": b, "weight": w} for (a, b), w in edge_weights.items()],
        "total_public": sum(counts.values()),
    }


@router.get("/global/all")
async def global_graph_all(limit: int = Query(250, le=400), db: AsyncSession = Depends(get_db)):
    """Единый граф всех публичных сущностей сразу — по умолчанию для просмотра.
    Ограничение размера — не костыль, а честный потолок: если публичных записей
    станет на порядки больше, здесь появится кластеризация, а не бесконечный рендер."""
    all_nodes = []
    type_counts: dict[str, int] = {}

    for name, model in ENTITY_MODELS.items():
        type_counts[name] = await db.scalar(select(func.count()).where(model.visibility == "public", model.deleted_at.is_(None))) or 0
        rows = (await db.execute(
            select(model).where(model.visibility == "public", model.deleted_at.is_(None)).order_by(model.created_at.desc()).limit(limit)
        )).scalars().all()
        for r in rows:
            content = extract_content(name, r)
            user = await db.get(User, r.user_id)
            all_nodes.append({
                "id": f"{name}_{r.id}", "type": name, "entity_id": r.id,
                "label": truncate_label(content["title"] or content["text"], 200),
                "author": user.display_name if user else "неизвестный автор",
                "_created_at": r.created_at,
            })

    all_nodes.sort(key=lambda n: n["_created_at"], reverse=True)
    truncated = len(all_nodes) > limit
    all_nodes = all_nodes[:limit]
    for n in all_nodes:
        n.pop("_created_at", None)

    ids_by_type: dict[str, set[int]] = {}
    for n in all_nodes:
        ids_by_type.setdefault(n["type"], set()).add(n["entity_id"])

    edges = []
    if ids_by_type:
        from_conds = [and_(Link.from_type == t, Link.from_id.in_(ids)) for t, ids in ids_by_type.items()]
        to_conds = [and_(Link.to_type == t, Link.to_id.in_(ids)) for t, ids in ids_by_type.items()]
        rows_links = (await db.execute(select(Link).where(or_(*from_conds), or_(*to_conds), links_alive()))).scalars().all()
        for l in rows_links:
            if l.from_id in ids_by_type.get(l.from_type, set()) and l.to_id in ids_by_type.get(l.to_type, set()):
                edges.append({"from": f"{l.from_type}_{l.from_id}", "to": f"{l.to_type}_{l.to_id}", "link_type": l.link_type})

        for from_type, to_type, from_id, to_id, link_type in await fk_edges_within(db, ids_by_type):
            edges.append({"from": f"{from_type}_{from_id}", "to": f"{to_type}_{to_id}", "link_type": link_type})

    return {"nodes": all_nodes, "edges": edges, "type_counts": type_counts, "truncated": truncated}


@router.get("/global/expand/{entity_type}")
async def global_graph_expand(entity_type: str, limit: int = Query(EXPAND_LIMIT, le=EXPAND_LIMIT), db: AsyncSession = Depends(get_db)):
    """Реальные узлы одного типа для разворачивания суперузла по клику."""
    model = ENTITY_MODELS.get(entity_type)
    if not model:
        raise HTTPException(400, "Неизвестный тип сущности")

    rows = (await db.execute(
        select(model).where(model.visibility == "public", model.deleted_at.is_(None)).order_by(model.created_at.desc()).limit(limit)
    )).scalars().all()
    ids = {r.id for r in rows}

    nodes = []
    for r in rows:
        content = extract_content(entity_type, r)
        user = await db.get(User, r.user_id)
        nodes.append({
            "id": f"{entity_type}_{r.id}", "type": entity_type, "entity_id": r.id,
            "label": truncate_label(content["title"] or content["text"], 220),
            "author": user.display_name if user else "неизвестный автор",
        })

    edges = []
    if ids:
        rows_links = (await db.execute(
            select(Link).where(
                or_(
                    and_(Link.from_type == entity_type, Link.from_id.in_(ids)),
                    and_(Link.to_type == entity_type, Link.to_id.in_(ids)),
                )
            )
        )).scalars().all()
        for l in rows_links:
            other_model = ENTITY_MODELS.get(l.to_type if l.from_type == entity_type else l.from_type)
            if not other_model:
                continue
            other_id = l.to_id if l.from_type == entity_type else l.from_id
            other = await get_live(db, other_model, other_id)
            if not other or other.visibility != "public":
                continue
            edges.append({"from": f"{l.from_type}_{l.from_id}", "to": f"{l.to_type}_{l.to_id}", "link_type": l.link_type})

        edges.extend(await fk_edges_from_entity(db, entity_type, ids))

    return {"type": entity_type, "nodes": nodes, "edges": edges, "truncated": len(rows) >= limit}
