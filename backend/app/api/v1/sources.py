from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.session import get_db
from app.core.deps import get_current_user
from app.core.lab_access import get_entity_for_view, get_entity_for_read, parent_alive_subquery
from app.services.repost import ENTITY_MODELS
from app.models.user import User
from app.models.entities import SourceDocument, Hypothesis, Prediction, Observation, Question, ResearchTask, Worldview, Result
import re as _re
from app.schemas.entities import SourceDocCreate, SourceDocOut, SourceDocVerdictUpdate, ALLOWED_SOURCE_ENTITY_TYPES
from app.services.scraper import scrape_url
from app.services.ai import analyze_source
from typing import List

router = APIRouter(prefix="/{entity_type}/{entity_id}/sources", tags=["sources"])


def _check_entity_type(entity_type: str) -> None:
    if entity_type not in ALLOWED_SOURCE_ENTITY_TYPES:
        raise HTTPException(404, "Источники недоступны для этого типа сущности")


async def _check_view_access(entity_type: str, entity_id: int, user_id: int, db: AsyncSession) -> None:
    """Доступ на ЧТЕНИЕ источников — владелец ИЛИ публичная ИЛИ участник
    лабы, тот же общий паттерн видимости, что и у остальных вкладок
    сущности (observations/hypotheses/predictions tabs используют
    /graph/related с той же логикой). НЕ путать с _get_entity_context —
    та функция для add_source, где нарочно требуется быть владельцем
    (чужому нельзя добавлять источники), здесь же цель другая: кто угодно
    с доступом к просмотру сущности должен видеть её источники, как и
    остальные её вкладки.

    Result — не в ENTITY_MODELS (тот словарь только для 6 базовых типов) и
    имеет свой путь публичности через is_published+visibility=="lab", как в
    list_linked_sources в results.py — не общий visibility=="public"."""
    if entity_type == "result":
        obj = await db.get(Result, entity_id)
        if not obj:
            raise HTTPException(404, "Не найдено")
        if obj.is_published and obj.visibility == "lab":
            return
        await get_entity_for_view(db, Result, entity_id, user_id)
        return
    model = ENTITY_MODELS.get(entity_type)
    if not model:
        raise HTTPException(404, "Источники недоступны для этого типа сущности")
    await get_entity_for_read(db, model, entity_id, user_id)  # чтение: и запись, открытая через связь


async def _get_entity_context(entity_type: str, entity_id: int, user_id: int, db: AsyncSession):
    """Возвращает (name, description) сущности для промпта анализа, либо None если не найдена.
    Единая точка расширения: добавить новый тип сущности с источниками — один блок здесь."""
    if entity_type == "hypothesis":
        row = (await db.execute(
            select(Hypothesis).where(Hypothesis.id == entity_id, Hypothesis.user_id == user_id, Hypothesis.deleted_at.is_(None))
        )).scalar_one_or_none()
        if not row:
            return None
        return row.name, row.description
    if entity_type == "prediction":
        row = (await db.execute(
            select(Prediction).where(Prediction.id == entity_id, Prediction.user_id == user_id, Prediction.deleted_at.is_(None))
        )).scalar_one_or_none()
        if not row:
            return None
        return (row.title or row.text or "")[:200], row.text
    if entity_type == "observation":
        row = (await db.execute(
            select(Observation).where(Observation.id == entity_id, Observation.user_id == user_id, Observation.deleted_at.is_(None))
        )).scalar_one_or_none()
        if not row:
            return None
        return (row.title or row.text or "")[:200], row.text
    if entity_type == "question":
        row = (await db.execute(
            select(Question).where(Question.id == entity_id, Question.user_id == user_id, Question.deleted_at.is_(None))
        )).scalar_one_or_none()
        if not row:
            return None
        return row.title, row.text
    if entity_type == "task":
        row = (await db.execute(
            select(ResearchTask).where(ResearchTask.id == entity_id, ResearchTask.user_id == user_id, ResearchTask.deleted_at.is_(None))
        )).scalar_one_or_none()
        if not row:
            return None
        return row.name, row.description
    if entity_type == "worldview":
        row = (await db.execute(
            select(Worldview).where(Worldview.id == entity_id, Worldview.user_id == user_id, Worldview.deleted_at.is_(None))
        )).scalar_one_or_none()
        if not row:
            return None
        return (row.belief or "")[:200], row.confirming_data
    if entity_type == "result":
        row = (await db.execute(
            select(Result).where(Result.id == entity_id, Result.user_id == user_id)
        )).scalar_one_or_none()
        if not row:
            return None
        # body — HTML от rich-редактора (Tiptap), в промпт анализа не годится
        # с тегами; та же логика очистки, что у stripHtml() на фронте.
        plain_body = _re.sub(r"<[^>]+>", "", row.body or "")
        return row.title, plain_body
    return None


async def _process_source(
    doc_id: int,
    entity_name: str,
    entity_desc: str,
    url: str,
) -> None:
    """Фоновая задача: скрапинг -> вес -> AI-анализ -> сохранение."""
    from sqlalchemy.ext.asyncio import AsyncSession
    from app.db.session import engine

    from app.services.embeddings import upsert_entity_embedding
    async with AsyncSession(engine, expire_on_commit=False) as db:
        doc = (
            await db.execute(select(SourceDocument).where(SourceDocument.id == doc_id))
        ).scalar_one_or_none()
        if not doc:
            return

        try:
            doc.status = "processing"
            await db.commit()

            scraped = await scrape_url(url)
            doc.title = scraped["title"]

            # Эмбеддим СЫРОЙ скрапленный текст, а не summary/verdict_reason ниже —
            # те генерируются одним и тем же промптом с одинаковой структурой
            # ответа, поэтому два независимых источника могут получить похожий
            # по стилю ИИ-пересказ и ложно "схлопнуться" в один бакет при расчёте
            # индекса разнообразия доказательств (см. обсуждение в чате).
            await upsert_entity_embedding(db, doc.user_id, "source_document", doc.id, scraped["text"][:8000])

            analysis = await analyze_source(entity_name, entity_desc, scraped["text"], url)
            doc.summary        = analysis["summary"]
            doc.verdict        = analysis["verdict"]
            doc.verdict_reason = analysis["verdict_reason"]
            doc.source_weight  = analysis["source_weight"]
            doc.source_type    = analysis["source_type"]
            doc.status         = "done"

        except Exception as e:
            doc.status    = "error"
            doc.error_msg = str(e)[:500]

        await db.commit()


@router.get("", response_model=List[SourceDocOut])
async def list_sources(
    entity_type: str,
    entity_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _check_entity_type(entity_type)
    await _check_view_access(entity_type, entity_id, user.id, db)

    rows = (
        await db.execute(
            select(SourceDocument)
            .where(SourceDocument.entity_type == entity_type, SourceDocument.entity_id == entity_id)
            .order_by(SourceDocument.created_at.desc())
        )
    ).scalars().all()
    return [SourceDocOut.model_validate(r) for r in rows]


@router.post("", response_model=SourceDocOut, status_code=201)
async def add_source(
    entity_type: str,
    entity_id: int,
    body: SourceDocCreate,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _check_entity_type(entity_type)
    ctx = await _get_entity_context(entity_type, entity_id, user.id, db)
    if ctx is None:
        raise HTTPException(404, "Сущность не найдена")
    entity_name, entity_desc = ctx

    doc = SourceDocument(
        user_id=user.id,
        entity_type=entity_type,
        entity_id=entity_id,
        url=str(body.url),
        status="pending",
    )
    db.add(doc)
    await db.flush()
    await db.commit()
    await db.refresh(doc)

    background_tasks.add_task(
        _process_source, doc.id, entity_name or "", entity_desc or "", str(body.url)
    )
    return SourceDocOut.model_validate(doc)


@router.patch("/{doc_id}/verdict", response_model=SourceDocOut)
async def set_verdict(
    entity_type: str,
    entity_id: int,
    doc_id: int,
    body: SourceDocVerdictUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _check_entity_type(entity_type)
    doc = (
        await db.execute(
            select(SourceDocument).where(
                SourceDocument.id == doc_id,
                SourceDocument.user_id == user.id,
                SourceDocument.entity_type == entity_type,
                SourceDocument.entity_id == entity_id,
                parent_alive_subquery(SourceDocument.entity_type, SourceDocument.entity_id),
            )
        )
    ).scalar_one_or_none()
    if not doc:
        raise HTTPException(404, "Источник не найден")

    if body.verdict not in ("confirms", "refutes", "unclear"):
        raise HTTPException(400, "Недопустимый вердикт")

    doc.verdict         = body.verdict
    doc.verdict_by_user = True
    if doc.entity_type == "hypothesis":
        from app.models.entities import Hypothesis
        from app.services.evidence_diversity import invalidate_evidence_diversity
        hyp = await db.get(Hypothesis, doc.entity_id)
        if hyp:
            invalidate_evidence_diversity(hyp)
    await db.commit()
    await db.refresh(doc)
    return SourceDocOut.model_validate(doc)


@router.delete("/{doc_id}", status_code=204)
async def delete_source(
    entity_type: str,
    entity_id: int,
    doc_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _check_entity_type(entity_type)
    doc = (
        await db.execute(
            select(SourceDocument).where(
                SourceDocument.id == doc_id,
                SourceDocument.user_id == user.id,
                SourceDocument.entity_type == entity_type,
                SourceDocument.entity_id == entity_id,
                parent_alive_subquery(SourceDocument.entity_type, SourceDocument.entity_id),
            )
        )
    ).scalar_one_or_none()
    if not doc:
        raise HTTPException(404, "Источник не найден")

    if doc.entity_type == "hypothesis":
        from app.models.entities import Hypothesis
        from app.services.evidence_diversity import invalidate_evidence_diversity
        hyp = await db.get(Hypothesis, doc.entity_id)
        if hyp:
            invalidate_evidence_diversity(hyp)

    await db.delete(doc)
    await db.commit()
