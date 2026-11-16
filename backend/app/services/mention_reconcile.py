"""Сверка entity_mentions с текстом: приводит таблицу к точному состоянию (бэкфилл и починка после правок мимо ORM).
Идемпотентна. Читает колонки и пишет Core-запросами: слушатель after_flush не участвует. Записи в корзине считаются
живыми (при restore упоминания возвращаются). Возвращает счётчики: add, stale (лишние у живого источника),
orphan_source (источника нет), orphan_target (записи-цели нет). apply=False ничего не пишет."""
from sqlalchemy import delete, insert, select

from app.core.entity_registry import ENTITY_MODELS
from app.core.mentions import extract_mentions
from app.models.entities import EntityMention, Result
from app.services.mention_sync import FIELDS, SOURCE_TYPES

_T = EntityMention.__table__
_CHUNK = 1000


async def reconcile_mentions(db, apply: bool = False) -> dict[str, int]:
    live: dict[str, set[int]] = {}
    for etype, model in {**ENTITY_MODELS, "result": Result}.items():
        live[etype] = set((await db.execute(select(model.id))).scalars().all())

    desired: set[tuple] = set()
    for model, etype in SOURCE_TYPES.items():
        for field in FIELDS[model]:
            for sid, html in (await db.execute(select(model.id, getattr(model, field)))).all():
                for tt, ti in extract_mentions(html):
                    if ti in live.get(tt, ()):
                        desired.add((etype, sid, field, tt, ti))

    existing = (await db.execute(select(_T.c.id, _T.c.source_type, _T.c.source_id, _T.c.field,
                                        _T.c.target_type, _T.c.target_id))).all()
    counts = {"add": 0, "stale": 0, "orphan_source": 0, "orphan_target": 0}
    drop: list[int] = []
    have: set[tuple] = set()
    for rid, st, sid, field, tt, ti in existing:
        key = (st, sid, field, tt, ti)
        if sid not in live.get(st, ()):
            counts["orphan_source"] += 1
        elif ti not in live.get(tt, ()):
            counts["orphan_target"] += 1
        elif key not in desired:
            counts["stale"] += 1
        else:
            have.add(key)
            continue
        drop.append(rid)
    to_add = sorted(desired - have)
    counts["add"] = len(to_add)

    if apply:
        for i in range(0, len(drop), _CHUNK):
            await db.execute(delete(_T).where(_T.c.id.in_(drop[i:i + _CHUNK])))
        for i in range(0, len(to_add), _CHUNK):
            await db.execute(insert(_T), [{"source_type": a, "source_id": b, "field": c, "target_type": d, "target_id": e}
                                          for a, b, c, d, e in to_add[i:i + _CHUNK]])
    return counts
