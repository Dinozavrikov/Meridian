from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, or_
from app.core.lab_access import parent_alive_subquery
from app.db.session import get_db
from app.core.deps import get_current_user
from app.core.deps import get_current_user_optional
from app.models.user import User
from app.models.entities import Question, Hypothesis, Tag, EntityTag, QuestionAnswerFeedback
from app.models.social import EntityComment
from app.services.repost import ENTITY_MODELS
from app.schemas.entities import QuestionCreate, QuestionUpdate, QuestionOut, HypOut, QuestionAnswerFeedbackVerdict
from app.core.lab_access import get_entity_for_view, get_entity_for_lab_manage, entity_visibility_filter, get_entity_for_read, opened_via_link_or_never, require_publication_consent, grant_publication, ShareChoice, can_link, resolve_lab_attachment, get_live
from app.services.owner_info import attach_owner_info
from app.services.access_info import attach_access
from app.services.entity_postprocess import run_entity_postprocessing_background
from app.services.events import emit_event
from app.services.entity_hypotheses import list_hyps, add_hyp, remove_hyp, get_competition
from app.services.question_answers import check_by_click
from app.core.slug import unique_slug_for
from app.db.redis import redis_client
from typing import List, Optional

from app.services.soft_delete import soft_delete_entity
router = APIRouter(prefix="/questions", tags=["questions"])


async def _get_tags(db, user_id, eid):
    r = await db.execute(
        select(Tag.name).join(EntityTag, EntityTag.tag_id == Tag.id)
        .where(EntityTag.entity_type == "question", EntityTag.entity_id == eid, Tag.user_id == user_id)
    )
    return [x[0] for x in r.fetchall()]


async def _set_tags(db, user_id, eid, tags):
    await db.execute(delete(EntityTag).where(EntityTag.entity_type == "question", EntityTag.entity_id == eid))
    for name in set(t.strip().lower() for t in tags if t.strip()):
        tag = (await db.execute(select(Tag).where(Tag.user_id == user_id, Tag.name == name))).scalar_one_or_none()
        if not tag:
            tag = Tag(user_id=user_id, name=name)
            db.add(tag)
            await db.flush()
        db.add(EntityTag(entity_type="question", entity_id=eid, tag_id=tag.id))
    await db.commit()


@router.get("/", response_model=List[QuestionOut])
async def list_questions(
    status: Optional[str] = None,
    priority: Optional[str] = None,
    user: Optional[User] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    user_id = user.id if user else None
    q = select(Question).where(or_(entity_visibility_filter(Question, user_id), opened_via_link_or_never(Question, "question", user_id)))
    q = q.where(Question.deleted_at.is_(None))  # корзину режем явно
    if status:
        q = q.where(Question.status == status)
    if priority:
        q = q.where(Question.priority == priority)
    q = q.order_by(Question.date_created.desc())
    rows = (await db.execute(q)).scalars().all()
    out = []
    for r in rows:
        item = QuestionOut.model_validate(r)
        item.tags = await _get_tags(db, user_id, r.id) if user_id is not None else []
        out.append(item)
    await attach_owner_info(db, out)
    await attach_access(db, out, user_id)
    return out


@router.post("/", response_model=QuestionOut, status_code=201)
async def create_question(body: QuestionCreate, background_tasks: BackgroundTasks, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    slug = await unique_slug_for(db, Question, body.title)
    visibility = await resolve_lab_attachment(db, body.lab_id, body.visibility, user.id)
    q = Question(
        user_id=user.id, title=body.title, slug=slug, text=body.text,
        status=body.status, priority=body.priority, importance=body.importance,
        answer=body.answer, date_created=body.date_created,
        visibility=visibility, lab_id=body.lab_id,
    )
    db.add(q)
    await db.flush()
    await _set_tags(db, user.id, q.id, body.tags)
    await emit_event(db, type="created", actor_id=user.id, entity_type="question",
                      entity_id=q.id, lab_id=q.lab_id, visibility=q.visibility)
    await db.commit()
    await db.refresh(q)
    # Фон: эмбеддинг для поиска ближайших открытых вопросов при implicit-проверке
    # (см. services/question_answers.py). check_on_save для entity_type="question"
    # намеренно не запускается (см. entity_postprocess.py) — вопрос не должен искать
    # ответ сам на себя среди открытых вопросов.
    background_tasks.add_task(run_entity_postprocessing_background, user.id, "question", q.id, f"{body.title}. {body.text}")
    item = QuestionOut.model_validate(q)
    item.tags = body.tags
    return item


@router.get("/{eid}", response_model=QuestionOut)
async def get_question(eid: str, user: Optional[User] = Depends(get_current_user_optional), db: AsyncSession = Depends(get_db)):
    cond = (Question.id == int(eid)) if eid.isdigit() else (Question.slug == eid)
    q = (await db.execute(select(Question).where(cond))).scalar_one_or_none()
    if not q:
        raise HTTPException(404, "Не найдено")
    q = await get_entity_for_read(db, Question, q.id, user.id if user else None)
    item = QuestionOut.model_validate(q)
    item.tags = await _get_tags(db, user.id if user else None, q.id)
    await attach_owner_info(db, [item])
    await attach_access(db, [item], user.id if user else None)
    return item


@router.put("/{eid}", response_model=QuestionOut)
async def update_question(eid: int, body: QuestionUpdate, background_tasks: BackgroundTasks, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    q = (await db.execute(select(Question).where(Question.id == eid, Question.user_id == user.id, Question.deleted_at.is_(None)))).scalar_one_or_none()
    if not q:
        raise HTTPException(404, "Не найдено")
    status_changed = q.status != body.status
    old_status = q.status
    from app.core.lab_access import reset_shares_on_visibility_change
    _new_vis = await resolve_lab_attachment(db, body.lab_id, body.visibility, user.id)
    await reset_shares_on_visibility_change(db, "question", q, _new_vis, body.lab_id, actor_id=user.id)
    q.title = body.title
    q.text = body.text
    q.status = body.status
    q.priority = body.priority
    # Значимость — единственное поле с частичным PUT: не прислали — не трогаем,
    # прислали null — «не оценено». Остальные поля, как и раньше, заменяются целиком.
    if "importance" in body.model_fields_set:
        q.importance = body.importance
    q.answer = body.answer
    q.date_created = body.date_created
    q.visibility = _new_vis
    q.lab_id = body.lab_id
    if status_changed:
        await emit_event(db, type="status_changed", actor_id=user.id, entity_type="question",
                          entity_id=eid, lab_id=q.lab_id, visibility=q.visibility,
                          meta={"old_status": old_status, "new_status": body.status})
    await _set_tags(db, user.id, eid, body.tags)
    await db.commit()
    await db.refresh(q)
    background_tasks.add_task(run_entity_postprocessing_background, user.id, "question", eid, f"{body.title}. {body.text}")
    item = QuestionOut.model_validate(q)
    item.tags = body.tags
    return item


@router.delete("/{eid}", status_code=204)
async def delete_question(eid: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    q = (await db.execute(select(Question).where(Question.id == eid, Question.user_id == user.id, Question.deleted_at.is_(None)))).scalar_one_or_none()
    if not q:
        raise HTTPException(404, "Не найдено")
    # Soft-delete: запись уходит в корзину владельца и хранится бессрочно.
    # Физическое удаление + каскад PR A — только DELETE /{entity_type}/{id}/permanent (trash.py).
    await soft_delete_entity(db, "question", q, user)


# — Конкурирующие гипотезы (полиморфная связь, строго для использования внутри лабораторий) —

@router.get("/{qid}/hypotheses", response_model=List[HypOut])
async def get_question_hyps(qid: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await get_entity_for_read(db, Question, qid, user.id)
    rows = await list_hyps(db, "question", qid, user.id)
    return [HypOut.model_validate(r) for r in rows]


@router.post("/{qid}/hypotheses/{hid}", status_code=204)
async def add_question_hyp(qid: int, hid: int, share: ShareChoice = None, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await get_entity_for_lab_manage(db, Question, qid, user.id)
    hyp = await can_link(db, Hypothesis, hid, user.id)  # единая политика LINK — нельзя привязать чужую приватную гипотезу вслепую
    impacts = await require_publication_consent(db, ("question", await db.get(Question, qid)), ("hypothesis", hyp),
                                     user.id, share, same_owner_only=True)  # у привязки нет автора: открывает при одном владельце
    await grant_publication(db, impacts, user.id)
    await add_hyp(db, "question", qid, hid, actor_id=user.id)
    await db.commit()


@router.delete("/{qid}/hypotheses/{hid}", status_code=204)
async def remove_question_hyp(qid: int, hid: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await get_entity_for_lab_manage(db, Question, qid, user.id)
    from app.services.link_events import emit_competing_unlinked
    await emit_competing_unlinked(db, user.id, "question", qid, hid)
    await remove_hyp(db, "question", qid, hid)
    await db.commit()


@router.get("/{qid}/competition")
async def get_question_competition(qid: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await get_entity_for_read(db, Question, qid, user.id)
    return await get_competition(db, "question", qid, with_scales=False, viewer_id=user.id)


RATE_LIMIT_MAX = 10       # вызовов
RATE_LIMIT_WINDOW = 60    # секунд


async def _check_answers_rate_limit(user_id: int) -> None:
    """Тот же fixed-window rate-limit через Redis, что в contradictions.py —
    защита explicit-проверки (по клику) от повторных/автоматизированных
    вызовов дорогого LLM-пайплайна."""
    key = f"question_answers:ratelimit:{user_id}"
    count = await redis_client.incr(key)
    if count == 1:
        await redis_client.expire(key, RATE_LIMIT_WINDOW)
    if count > RATE_LIMIT_MAX:
        raise HTTPException(429, "Слишком много проверок подряд, попробуйте через минуту")


@router.post("/{qid}/check-answers")
async def check_answers(
    qid: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Явный вызов по кнопке "проверить по своим данным" на странице
    вопроса — ищет ответ в личном корпусе пользователя (см.
    services/question_answers.py). Владение вопросом проверяется
    строго — get_entity_for_view пропустил бы и участника лабы/публичный
    вопрос, но искать в ЧУЖОМ корпусе по клику на вопросе, который просто
    виден, не имеет смысла и является утечкой чужих данных."""
    q = await get_live(db, Question, qid)
    if not q or q.user_id != user.id:
        raise HTTPException(404, "Не найдено")

    await _check_answers_rate_limit(user.id)

    results = await check_by_click(db, qid, user.id)

    saved_ids = []
    for item in results:
        fb = QuestionAnswerFeedback(
            user_id=user.id,
            question_id=qid,
            source_entity_type=item["entity_type"],
            source_entity_id=item["entity_id"],
            matched_quote=item["quote"],
            confidence=item["confidence"],
            verdict="pending",
        )
        db.add(fb)
        await db.flush()
        saved_ids.append(fb.id)
    await db.commit()

    return [{"feedback_id": fid, **item} for fid, item in zip(saved_ids, results)]


@router.post("/answer-feedback/{feedback_id}/verdict")
async def set_answer_verdict(
    feedback_id: int,
    payload: QuestionAnswerFeedbackVerdict,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if payload.verdict not in ("accepted", "rejected"):
        raise HTTPException(400, "verdict должен быть accepted или rejected")

    fb = (await db.execute(
        select(QuestionAnswerFeedback).where(
            QuestionAnswerFeedback.id == feedback_id,
            parent_alive_subquery("question", QuestionAnswerFeedback.question_id),
            QuestionAnswerFeedback.user_id == user.id,
        )
    )).scalar_one_or_none()
    if not fb:
        raise HTTPException(404, "Запись не найдена")

    fb.verdict = payload.verdict

    # При принятии ("это ответ") — добавляем цитату в заметки вопроса
    # автоматически, чтобы принятие ответа было реальным действием, а не
    # просто пометкой для внутренней калибровки (см. обсуждение бага в чате:
    # раньше accept ничего не менял для самого пользователя).
    if payload.verdict == "accepted":
        model = ENTITY_MODELS.get(fb.source_entity_type)
        entity_label = fb.source_entity_type
        if model:
            entity = await db.get(model, fb.source_entity_id)
            if entity:
                entity_label = getattr(entity, "title", None) or getattr(entity, "name", None) or getattr(entity, "belief", None) or fb.source_entity_type
        note_content = f"Возможный ответ (из «{entity_label}»): «{fb.matched_quote}»"
        db.add(EntityComment(
            entity_type="question",
            entity_id=fb.question_id,
            author_id=user.id,
            content=note_content,
            source="question_answer",
        ))
        # Дублируем и в поле answer самого вопроса — дописываем, а не
        # затираем, если там уже что-то есть (например, свой более ранний
        # ручной ответ или другая принятая находка).
        question = await db.get(Question, fb.question_id)
        if question is not None:
            question.answer = f"{question.answer}\n\n{note_content}".strip() if question.answer else note_content

    await db.commit()
    return {"ok": True}


@router.get("/answer-feedback/pending")
async def list_pending_answers(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Список непросмотренных найденных ответов пользователя — как со
    страницы конкретного вопроса (explicit), так и найденных фоном при
    сохранении других сущностей (implicit, см. check_on_save). Персистентная
    запись в БД, а не React-state — переживает переход между страницами."""
    rows = (await db.execute(
        select(QuestionAnswerFeedback)
        .where(
            QuestionAnswerFeedback.user_id == user.id,
            QuestionAnswerFeedback.verdict == "pending",
            parent_alive_subquery("question", QuestionAnswerFeedback.question_id),
            parent_alive_subquery(QuestionAnswerFeedback.source_entity_type, QuestionAnswerFeedback.source_entity_id),
        )
        .order_by(QuestionAnswerFeedback.created_at.desc())
    )).scalars().all()

    return [
        {
            "feedback_id": r.id,
            "question_id": r.question_id,
            "entity_type": r.source_entity_type,
            "entity_id": r.source_entity_id,
            "quote": r.matched_quote,
            "confidence": r.confidence,
            "created_at": r.created_at.isoformat(),
        }
        for r in rows
    ]
