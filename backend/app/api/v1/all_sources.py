from app.schemas._strict import StrictIn, Short16, Short32, Short128, Short255, LongText
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.lab_access import parent_alive_subquery
from app.db.session import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.entities import SourceDocument, Hypothesis, Prediction
from pydantic import BaseModel
from typing import Optional

router = APIRouter(prefix="/sources", tags=["sources-global"])


class SourceEditBody(StrictIn):
    verdict: Optional[Short32] = None
    summary: Optional[LongText] = None
    verdict_by_user: bool = True


@router.get("/")
async def list_all_sources(
    user: User = Depends(get_current_user),
    db:   AsyncSession = Depends(get_db),
):
    """Все источники пользователя, сгруппированные по сущности (гипотеза/прогноз/...)."""
    rows = (await db.execute(
        select(SourceDocument)
        .where(SourceDocument.user_id == user.id,
               parent_alive_subquery(SourceDocument.entity_type, SourceDocument.entity_id))
        .order_by(SourceDocument.entity_type, SourceDocument.entity_id, SourceDocument.created_at.desc())
    )).scalars().all()

    # Имена сущностей достаём отдельными запросами по типу — избегаем сложного
    # полиморфного JOIN на разные таблицы за один SQL-запрос.
    hyp_ids = {r.entity_id for r in rows if r.entity_type == "hypothesis"}
    pred_ids = {r.entity_id for r in rows if r.entity_type == "prediction"}

    hyp_names: dict = {}
    if hyp_ids:
        hyp_rows = (await db.execute(
            select(Hypothesis.id, Hypothesis.name).where(Hypothesis.id.in_(hyp_ids))
        )).all()
        hyp_names = {h.id: h.name for h in hyp_rows}

    pred_names: dict = {}
    if pred_ids:
        pred_rows = (await db.execute(
            select(Prediction.id, Prediction.title, Prediction.text).where(Prediction.id.in_(pred_ids))
        )).all()
        pred_names = {p.id: (p.title or p.text or "")[:80] for p in pred_rows}

    def entity_name(entity_type: str, entity_id: int) -> str:
        if entity_type == "hypothesis":
            return hyp_names.get(entity_id, "")
        if entity_type == "prediction":
            return pred_names.get(entity_id, "")
        return ""

    grouped: dict = {}
    for src in rows:
        key = (src.entity_type, src.entity_id)
        if key not in grouped:
            grouped[key] = {
                "entity_type": src.entity_type,
                "entity_id":   src.entity_id,
                "entity_name": entity_name(src.entity_type, src.entity_id),
                "sources": [],
            }
        grouped[key]["sources"].append({
            "id":             src.id,
            "url":            src.url,
            "title":          src.title,
            "summary":        src.summary,
            "verdict":        src.verdict,
            "verdict_reason": src.verdict_reason,
            "verdict_by_user":src.verdict_by_user,
            "weight_reason":  src.weight_reason,
            "source_weight":  src.source_weight,
            "source_type":    src.source_type,
            "status":         src.status,
            "error_msg":      src.error_msg,
            "created_at":     src.created_at.isoformat() if src.created_at else "",
        })

    return list(grouped.values())


@router.patch("/{doc_id}")
async def edit_source(
    doc_id: int,
    body:   SourceEditBody,
    user:   User = Depends(get_current_user),
    db:     AsyncSession = Depends(get_db),
):
    doc = (await db.execute(
        select(SourceDocument).where(
            SourceDocument.id == doc_id,
            SourceDocument.user_id == user.id,
            parent_alive_subquery(SourceDocument.entity_type, SourceDocument.entity_id),
        )
    )).scalar_one_or_none()
    if not doc:
        raise HTTPException(404, "Источник не найден")

    if body.verdict is not None:
        if body.verdict not in ("confirms", "refutes", "unclear"):
            raise HTTPException(400, "Недопустимый вердикт")
        doc.verdict = body.verdict
        doc.verdict_by_user = True

    if body.summary is not None:
        doc.summary = body.summary[:2000]

    await db.commit()
    await db.refresh(doc)
    return {"ok": True, "id": doc.id, "verdict": doc.verdict, "summary": doc.summary}


@router.delete("/{doc_id}", status_code=204)
async def delete_source_global(
    doc_id: int,
    user:   User = Depends(get_current_user),
    db:     AsyncSession = Depends(get_db),
):
    doc = (await db.execute(
        select(SourceDocument).where(
            SourceDocument.id == doc_id,
            SourceDocument.user_id == user.id,
            parent_alive_subquery(SourceDocument.entity_type, SourceDocument.entity_id),
        )
    )).scalar_one_or_none()
    if not doc:
        raise HTTPException(404, "Источник не найден")
    await db.delete(doc)
    await db.commit()
