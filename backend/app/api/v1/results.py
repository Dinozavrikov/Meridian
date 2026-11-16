"""Result — финальный артефакт исследования лабы (см. ТЗ п.11/п.24, и
обсуждение с Алексеем: сознательное исключение из "не плодить сущности" —
Result выражает синтезированный документ со ссылками на многие сущности,
не вердикт одного прогноза). lab_id обязателен — Result всегда принадлежит
лабе, не бывает личным.
Видимость снаружи лабы (не участнику) требует ВСЕХ ТРЕХ условий разом:
lab.is_public AND Result.visibility == "lab" AND Result.is_published.
Публичность лабы сама по себе НЕ открывает lab-результаты снаружи -
is_published обязателен как отдельный явный акт (ТЗ п.24):
- разрешена только owner/admin лабы;
- разрешена только когда Result.visibility == "lab" (никогда напрямую из
  "private");
- автоматически сбрасывается в False при уходе visibility из "lab"
  (см. update_result) - раньше это была живая дыра: is_published мог
  остаться True после отката visibility в "private", открывая формально
  приватный документ всем, включая гостей, даже из закрытой лабы.
Видимость ВНУТРИ лабы (участнику) от is_published не зависит вообще -
Result.visibility == "lab" уже значит "видно всей лабе", безусловно.

Совместное редактирование — не прямой edit чужого документа (это следует
из общей политики "редактировать чужую entity нельзя", ТЗ §16), а через
ResultEditSuggestion: любой участник лабы предлагает полную альтернативную
версию body, только owner/admin лабы решает — принять (заменяет текущий
body) или отклонить. Хранится целая версия, не diff — diff вычисляется на
лету во фронтенде для отображения, не в БД."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime, timezone
from typing import List, Optional

from app.core.lab_access import get_live, visible_results_stmt
from app.db.session import get_db
from app.core.deps import get_current_user, get_current_user_optional
from app.models.user import User
from app.models.entities import (
    Result, ResultEditSuggestion, ResultSourceLink, SourceDocument,
    Observation, Hypothesis, Prediction, Worldview, Question, ResearchTask,
)
from app.models.social import Lab, LabMember
from app.schemas.entities import (
    ResultCreate, ResultUpdate, ResultOut,
    ResultEditSuggestionCreate, ResultEditSuggestionOut,
    ResultSourceLinkOut, AvailableLabSourceOut, ResultSourceLinkCreate,
    ResultSourceOriginOut, SourceDocOut,
)
from app.core.slug import make_slug
from app.core.lab_access import get_entity_for_view, resolve_lab_attachment, _lab_role
from app.services.owner_info import attach_owner_info
from app.services.events import emit_event

router = APIRouter(prefix="/results", tags=["results"])


async def _unique_slug(db, base_title):
    base = make_slug(base_title)
    slug = base
    i = 2
    while (await db.execute(select(Result).where(Result.slug == slug))).scalar_one_or_none():
        slug = f"{base}-{i}"
        i += 1
    return slug


async def _resolve_result_visibility(db: AsyncSession, lab_id: int, requested_visibility: str, user_id: int) -> str:
    """Result всегда привязан к лабе (lab_id NOT NULL). visibility здесь -
    "виден ли черновик остальным участникам лабы": "private" (только
    автор) или "lab" (вся лаба), задаётся автором напрямую и НЕ выводится
    из lab.is_public (в отличие от resolve_lab_attachment/visibility_from_lab
    для прочих сущностей - та функция никогда не отдаёт "private", что
    сделало бы приватный черновик недостижимым через API).
    Публичность СНАРУЖИ лабы - отдельный вопрос, не этот метод: требует
    ВСЕХ ТРЕХ условий разом (lab.is_public AND visibility=="lab" AND
    is_published), см. докстринг модуля выше и get_result."""
    lab = await db.get(Lab, lab_id)
    if not lab:
        raise HTTPException(404, "Лаборатория не найдена")
    if not await _lab_role(db, lab_id, user_id):
        raise HTTPException(403, "Вы не участник этой лаборатории")
    if requested_visibility not in ("private", "lab"):
        raise HTTPException(400, "visibility результата может быть только 'private' или 'lab'")
    return requested_visibility


async def _attach_author_info(db: AsyncSession, items: list) -> list:
    """Как attach_owner_info, но для ResultEditSuggestionOut — поле называется
    author_id/author_username, не user_id/owner_username (attach_owner_info
    жёстко завязан на последние, здесь не подходит без изменений)."""
    ids = {getattr(item, "author_id", None) for item in items}
    ids.discard(None)
    if not ids:
        return items
    rows = (await db.execute(select(User.id, User.username, User.display_name).where(User.id.in_(ids)))).all()
    by_id = {uid: (username, display_name) for uid, username, display_name in rows}
    for item in items:
        aid = getattr(item, "author_id", None)
        if aid in by_id:
            item.author_username, item.author_display_name = by_id[aid]
    return items


# ── Источники: прикрепление уже существующих (не копирование) ──────────────
# см. модель ResultSourceLink — только сущности этой же лабы, только owner
# результата может прикреплять/откреплять (та же owner-only политика, что и
# update_result — контент неприкосновенен даже для lab admin, см. ACCESS_POLICY.md).

_LAB_SOURCE_ENTITY_MODELS = {
    "observation": Observation, "hypothesis": Hypothesis, "prediction": Prediction,
    "worldview": Worldview, "question": Question, "task": ResearchTask,
}


def _entity_display_name(entity_type: str, row) -> str:
    """Та же логика имени сущности, что в sources.py::_get_entity_context —
    независимая копия здесь осознанно (другой набор возвращаемых полей:
    там (name, description) для промпта, здесь только name для UI)."""
    if entity_type == "hypothesis":
        return row.name
    if entity_type in ("prediction", "observation"):
        return (row.title or row.text or "")[:200]
    if entity_type == "question":
        return row.title
    if entity_type == "task":
        return row.name
    if entity_type == "worldview":
        return (row.belief or "")[:200]
    return ""


async def _lab_entity_sources(db: AsyncSession, lab_id: int):
    """Все SourceDocument, прикреплённые к сущностям (не Result) этой лабы —
    список (doc, entity_type, entity_id, entity_name)."""
    out = []
    for entity_type, Model in _LAB_SOURCE_ENTITY_MODELS.items():
        rows = (await db.execute(select(Model).where(Model.lab_id == lab_id, Model.deleted_at.is_(None)))).scalars().all()
        if not rows:
            continue
        by_id = {r.id: r for r in rows}
        docs = (await db.execute(
            select(SourceDocument).where(
                SourceDocument.entity_type == entity_type,
                SourceDocument.entity_id.in_(by_id.keys()),
            )
        )).scalars().all()
        for doc in docs:
            row = by_id.get(doc.entity_id)
            out.append((doc, entity_type, doc.entity_id, _entity_display_name(entity_type, row) if row else ""))
    return out


@router.get("/", response_model=List[ResultOut])
async def list_results(
    lab_id: Optional[int] = None,
    user: Optional[User] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    user_id = user.id if user else None
    q = (await visible_results_stmt(db, user_id, lab_id)).order_by(Result.created_at.desc())
    rows = (await db.execute(q)).scalars().all()
    out = [ResultOut.model_validate(r) for r in rows]
    await attach_owner_info(db, out)
    return out


@router.post("/", response_model=ResultOut, status_code=201)
async def create_result(body: ResultCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    # lab_id обязателен на уровне схемы — resolve_lab_attachment всё равно
    # прогоняется, чтобы проверить членство и вывести visibility из lab.is_public,
    # той же единой точкой входа, что и у остальных сущностей.
    visibility = await _resolve_result_visibility(db, body.lab_id, body.visibility, user.id)
    slug = await _unique_slug(db, body.title)
    res = Result(
        user_id=user.id, lab_id=body.lab_id, title=body.title, slug=slug,
        body=body.body, visibility=visibility,
    )
    db.add(res)
    await db.flush()
    await emit_event(db, type="created", actor_id=user.id, entity_type="result",
                      entity_id=res.id, lab_id=res.lab_id, visibility=res.visibility)
    await db.commit()
    await db.refresh(res)
    r = ResultOut.model_validate(res)
    await attach_owner_info(db, [r])
    return r


@router.get("/{eid}", response_model=ResultOut)
async def get_result(eid: str, user: Optional[User] = Depends(get_current_user_optional), db: AsyncSession = Depends(get_db)):
    cond = (Result.id == int(eid)) if eid.isdigit() else (Result.slug == eid)
    res = (await db.execute(select(Result).where(cond))).scalar_one_or_none()
    if not res:
        raise HTTPException(404, "Не найдено")
    user_id = user.id if user else None
    # Опубликованный результат читаем публично, даже вне обычной
    # visibility-цепочки (ТЗ п.24: публикация — независимый канал доступа,
    # не расширение visibility самой записи).
    if res.is_published and res.visibility == "lab":
        lab = await db.get(Lab, res.lab_id)
        if lab and lab.is_public:
            r = ResultOut.model_validate(res)
            await attach_owner_info(db, [r])
            return r
    res = await get_entity_for_view(db, Result, res.id, user_id)
    r = ResultOut.model_validate(res)
    await attach_owner_info(db, [r])
    return r


@router.put("/{eid}", response_model=ResultOut)
async def update_result(eid: int, body: ResultUpdate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    res = (await db.execute(select(Result).where(Result.id == eid, Result.user_id == user.id))).scalar_one_or_none()
    if not res:
        raise HTTPException(404, "Не найдено")
    res.title = body.title
    res.body = body.body
    # lab_id намеренно не редактируется здесь (ТЗ §21 — не делать свободное
    # перемещение между лабами); visibility можно менять в пределах уже
    # закреплённого lab_id через ту же resolve_lab_attachment-логику.
    res.visibility = await _resolve_result_visibility(db, res.lab_id, body.visibility, user.id)
    if res.visibility != "lab" and res.is_published:
        res.is_published = False
    await db.commit()
    await db.refresh(res)
    r = ResultOut.model_validate(res)
    await attach_owner_info(db, [r])
    return r


@router.delete("/{eid}", status_code=204)
async def delete_result(eid: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    res = (await db.execute(select(Result).where(Result.id == eid, Result.user_id == user.id))).scalar_one_or_none()
    if not res:
        raise HTTPException(404, "Не найдено")
    # результат = то, чем поделились: черновик (private) удаляется, остальное нет (решено Алексеем).
    # Опубликованный всегда lab (publish требует lab, update_result снимает публикацию при выходе из lab).
    if res.visibility != "private":
        raise HTTPException(409, "Результат, которым поделились с лабораторией, удалить нельзя")
    await db.delete(res)
    await db.commit()


@router.post("/{eid}/publish", response_model=ResultOut)
async def publish_result(eid: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    res = await db.get(Result, eid)
    if not res:
        raise HTTPException(404, "Не найдено")
    role = await _lab_role(db, res.lab_id, user.id)
    if role not in ("owner", "admin"):
        raise HTTPException(403, "Публиковать результат может только владелец или админ лабы")
    if res.visibility != "lab":
        raise HTTPException(400, "Публиковать можно только результат с видимостью 'в лабе' — не приватный")
    res.is_published = True
    await db.commit()
    await db.refresh(res)
    r = ResultOut.model_validate(res)
    await attach_owner_info(db, [r])
    return r


@router.post("/{eid}/unpublish", response_model=ResultOut)
async def unpublish_result(eid: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    res = await db.get(Result, eid)
    if not res:
        raise HTTPException(404, "Не найдено")
    role = await _lab_role(db, res.lab_id, user.id)
    if role not in ("owner", "admin"):
        raise HTTPException(403, "Отменить публикацию может только владелец или админ лабы")
    res.is_published = False
    await db.commit()
    await db.refresh(res)
    r = ResultOut.model_validate(res)
    await attach_owner_info(db, [r])
    return r


# ── Источники (продолжение) ─────────────────────────────────────────────────

@router.get("/{eid}/sources/available", response_model=List[AvailableLabSourceOut])
async def list_available_lab_sources(eid: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    res = (await db.execute(select(Result).where(Result.id == eid, Result.user_id == user.id))).scalar_one_or_none()
    if not res:
        raise HTTPException(404, "Не найдено")
    linked_ids = set((await db.execute(
        select(ResultSourceLink.source_document_id).where(ResultSourceLink.result_id == eid)
    )).scalars().all())
    rows = await _lab_entity_sources(db, res.lab_id)
    return [
        AvailableLabSourceOut(
            source=SourceDocOut.model_validate(doc),
            origin=ResultSourceOriginOut(entity_type=entity_type, entity_id=entity_id, entity_name=name),
            already_linked=doc.id in linked_ids,
            is_own=doc.user_id == user.id,
        )
        for doc, entity_type, entity_id, name in rows
    ]

# Тот же список источников лабы, но по lab_id напрямую — для формы создания
# результата, когда eid ещё не существует (результат не сохранён). Ничего
# не может быть already_linked на этом этапе, т.к. ResultSourceLink ссылается
# на ещё не существующий result_id.
@router.get("/labs/{lab_id}/sources/available", response_model=List[AvailableLabSourceOut])
async def list_available_lab_sources_by_lab(lab_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not await _lab_role(db, lab_id, user.id):
        raise HTTPException(403, "Не участник лабы")
    rows = await _lab_entity_sources(db, lab_id)
    return [
        AvailableLabSourceOut(
            source=SourceDocOut.model_validate(doc),
            origin=ResultSourceOriginOut(entity_type=entity_type, entity_id=entity_id, entity_name=name),
            already_linked=False,
            is_own=doc.user_id == user.id,
        )
        for doc, entity_type, entity_id, name in rows
    ]


@router.get("/{eid}/sources/linked", response_model=List[ResultSourceLinkOut])
async def list_linked_sources(eid: int, user: Optional[User] = Depends(get_current_user_optional), db: AsyncSession = Depends(get_db)):
    res = await db.get(Result, eid)
    if not res:
        raise HTTPException(404, "Не найдено")
    user_id = user.id if user else None
    if not (res.is_published and res.visibility == "lab"):
        await get_entity_for_view(db, Result, res.id, user_id)
    links = (await db.execute(select(ResultSourceLink).where(ResultSourceLink.result_id == eid))).scalars().all()
    if not links:
        return []
    doc_ids = [l.source_document_id for l in links]
    docs = {d.id: d for d in (await db.execute(select(SourceDocument).where(SourceDocument.id.in_(doc_ids)))).scalars().all()}
    out = []
    for link in links:
        doc = docs.get(link.source_document_id)
        if not doc:
            continue
        Model = _LAB_SOURCE_ENTITY_MODELS.get(doc.entity_type)
        row = await db.get(Model, doc.entity_id) if Model else None
        if row is not None and getattr(row, "deleted_at", None) is not None:
            continue  # исходная запись в корзине — её источник в результате не показываем
        out.append(ResultSourceLinkOut(
            id=link.id, source=SourceDocOut.model_validate(doc),
            origin=ResultSourceOriginOut(entity_type=doc.entity_type, entity_id=doc.entity_id,
                                          entity_name=_entity_display_name(doc.entity_type, row) if row else ""),
        ))
    return out


@router.post("/{eid}/sources/link", response_model=ResultSourceLinkOut, status_code=201)
async def link_source(eid: int, body: ResultSourceLinkCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    res = (await db.execute(select(Result).where(Result.id == eid, Result.user_id == user.id))).scalar_one_or_none()
    if not res:
        raise HTTPException(404, "Не найдено")
    doc = await db.get(SourceDocument, body.source_document_id)
    if not doc:
        raise HTTPException(404, "Источник не найден")
    Model = _LAB_SOURCE_ENTITY_MODELS.get(doc.entity_type)
    owner_row = await get_live(db, Model, doc.entity_id) if Model else None
    if not owner_row or owner_row.lab_id != res.lab_id:
        raise HTTPException(403, "Источник не принадлежит этой лаборатории")
    existing = (await db.execute(
        select(ResultSourceLink).where(ResultSourceLink.result_id == eid, ResultSourceLink.source_document_id == doc.id)
    )).scalar_one_or_none()
    link = existing
    if not link:
        link = ResultSourceLink(result_id=eid, source_document_id=doc.id)
        db.add(link)
        await db.commit()
        await db.refresh(link)
    return ResultSourceLinkOut(
        id=link.id, source=SourceDocOut.model_validate(doc),
        origin=ResultSourceOriginOut(entity_type=doc.entity_type, entity_id=doc.entity_id,
                                      entity_name=_entity_display_name(doc.entity_type, owner_row)),
    )


@router.delete("/{eid}/sources/link/{link_id}", status_code=204)
async def unlink_source(eid: int, link_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    res = (await db.execute(select(Result).where(Result.id == eid, Result.user_id == user.id))).scalar_one_or_none()
    if not res:
        raise HTTPException(404, "Не найдено")
    link = (await db.execute(
        select(ResultSourceLink).where(ResultSourceLink.id == link_id, ResultSourceLink.result_id == eid)
    )).scalar_one_or_none()
    if not link:
        raise HTTPException(404, "Связь не найдена")
    await db.delete(link)
    await db.commit()


# ── Совместное редактирование через предложения ────────────────────────────

@router.post("/{eid}/suggestions", response_model=ResultEditSuggestionOut, status_code=201)
async def create_suggestion(eid: int, body: ResultEditSuggestionCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    res = await get_entity_for_view(db, Result, eid, user.id)
    role = await _lab_role(db, res.lab_id, user.id)
    if role is None:
        raise HTTPException(403, "Предлагать правки может только участник лабы")
    sug = ResultEditSuggestion(result_id=eid, author_id=user.id, proposed_body=body.proposed_body, status="pending")
    db.add(sug)
    await db.commit()
    await db.refresh(sug)
    s = ResultEditSuggestionOut.model_validate(sug)
    await _attach_author_info(db, [s])
    return s


@router.get("/{eid}/suggestions", response_model=List[ResultEditSuggestionOut])
async def list_suggestions(eid: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    res = await db.get(Result, eid)
    if not res:
        raise HTTPException(404, "Не найдено")
    role = await _lab_role(db, res.lab_id, user.id)
    if role is None:
        raise HTTPException(403, "Смотреть предложения может только участник лабы")
    rows = (await db.execute(
        select(ResultEditSuggestion)
        .where(ResultEditSuggestion.result_id == eid)
        .order_by(ResultEditSuggestion.created_at.desc())
    )).scalars().all()
    items = [ResultEditSuggestionOut.model_validate(r) for r in rows]
    await _attach_author_info(db, items)
    return items


@router.post("/{eid}/suggestions/{sid}/accept", response_model=ResultOut)
async def accept_suggestion(eid: int, sid: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    res = await get_entity_for_view(db, Result, eid, user.id)
    role = await _lab_role(db, res.lab_id, user.id)
    if role not in ("owner", "admin"):
        raise HTTPException(403, "Принимать правки может только владелец или админ лабы")
    sug_res = await db.execute(
        select(ResultEditSuggestion)
        .where(ResultEditSuggestion.id == sid)
        .with_for_update()
    )
    sug = sug_res.scalar_one_or_none()
    if not sug or sug.result_id != eid:
        raise HTTPException(404, "Предложение не найдено")
    if sug.status != "pending":
        raise HTTPException(400, "Предложение уже рассмотрено")
    res.body = sug.proposed_body
    sug.status = "accepted"
    sug.decided_at = datetime.now(timezone.utc).replace(tzinfo=None)
    sug.decided_by = user.id
    await db.commit()
    await db.refresh(res)
    r = ResultOut.model_validate(res)
    await attach_owner_info(db, [r])
    return r


@router.post("/{eid}/suggestions/{sid}/reject", status_code=204)
async def reject_suggestion(eid: int, sid: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    res = await db.get(Result, eid)
    if not res:
        raise HTTPException(404, "Не найдено")
    role = await _lab_role(db, res.lab_id, user.id)
    if role not in ("owner", "admin"):
        raise HTTPException(403, "Отклонять правки может только владелец или админ лабы")
    sug = await db.get(ResultEditSuggestion, sid)
    if not sug or sug.result_id != eid:
        raise HTTPException(404, "Предложение не найдено")
    if sug.status != "pending":
        raise HTTPException(400, "Предложение уже рассмотрено")
    sug.status = "rejected"
    sug.decided_at = datetime.now(timezone.utc).replace(tzinfo=None)
    sug.decided_by = user.id
    await db.commit()
