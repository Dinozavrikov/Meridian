from app.schemas._strict import StrictIn, Short16, Short32, Short128, Short255, LongText
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import union, select, func, distinct, or_
from datetime import date
from app.core.lab_access import get_live, parent_alive_subquery, visible_results_stmt, opened_via_link_condition
from app.db.session import get_db
from app.models.social import Lab, LabMember, LabJoinRequest
from app.models.entities import Observation, Hypothesis, Prediction, EntityHypothesis, Link
from app.models.user import User
from app.core.deps import get_current_user
from app.core.deps import get_current_user_optional
from app.services.calibration_source import rows_for_lab_by_user, calibration_score
from app.services.hypothesis_evidence import MIN_TAG_CALIBRATION_N
from app.core.slug import make_slug, unique_slug_for
from app.core.lab_access import visibility_from_lab
from pydantic import BaseModel
from typing import Optional

router = APIRouter(prefix="/labs", tags=["labs"])




class LabCreate(StrictIn):
    name: Short128
    description: LongText = ""
    is_public: bool = False
    open_join: bool = False                 # вступление без одобрения (только если is_public)
    goal_type: Short16                          # "task" | "question"
    goal_id: Optional[int] = None           # привязать существующую свою задачу/вопрос
    new_goal_title: Optional[Short255] = None    # либо создать новую с этим заголовком


class LabOut(BaseModel):
    id: int
    owner_id: int
    name: str
    slug: str
    description: str
    is_public: bool
    open_join: bool = False
    goal_type: Optional[str] = None
    goal_id: Optional[int] = None
    member_count: int = 0
    observations_count: int = 0
    observations_opened_count: int = 0
    hypotheses_count: int = 0
    predictions_count: int = 0
    predictions_opened_count: int = 0
    results_count: int = 0
    role: Optional[str] = None
    model_config = {"from_attributes": True}


class MemberOut(BaseModel):
    user_id: int
    username: str
    display_name: str
    avatar_url: Optional[str] = None
    role: str
    # Калибровка — см. docstring get_members. Список не пагинирован (участников лабы не бывает
    # тысячи, в отличие от ленты/комментариев — один SQL-проход на всех), сортировка на фронте.
    n_closed: int = 0
    score_pct: Optional[int] = None  # None = либо не участник (скрыто), либо < MIN_TAG_CALIBRATION_N


class RoleUpdate(StrictIn):
    role: Short32  # "admin" | "member"


class JoinRequestIn(StrictIn):
    message: LongText = ""


class JoinRequestOut(BaseModel):
    id: int
    user_id: int
    username: str
    display_name: str
    message: str
    status: str
    created_at: str


class DeclineIn(StrictIn):
    reason: LongText = ""


async def _resolve_lab_id(db: AsyncSession, lab_id: str) -> int:
    """Принимает numeric id или slug (как в hypotheses.py/questions.py) и
    возвращает числовой id лабы. 404, если не найдена — единообразно для
    всех эндпоинтов ниже, вместо дублирования этой проверки в каждом."""
    if lab_id.isdigit():
        return int(lab_id)
    lab = await db.scalar(select(Lab.id).where(Lab.slug == lab_id))
    if not lab:
        raise HTTPException(404, "Лаборатория не найдена")
    return lab


@router.get("", response_model=list[LabOut])
async def my_labs(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Лаборатории где я участник или владелец."""
    rows = await db.execute(
        select(Lab, LabMember.role)
        .join(LabMember, Lab.id == LabMember.lab_id)
        .where(LabMember.user_id == user.id)
        .order_by(Lab.created_at.desc())
    )
    result = []
    for lab, role in rows:
        cnt = await db.scalar(select(func.count()).where(LabMember.lab_id == lab.id))
        out = LabOut.model_validate(lab)
        out.member_count = cnt or 0
        out.role = role
        result.append(out)
    return result


@router.get("/public", response_model=list[LabOut])
async def public_labs(db: AsyncSession = Depends(get_db)):
    rows = await db.execute(select(Lab).where(Lab.is_public == True).order_by(Lab.created_at.desc()))
    result = []
    for (lab,) in rows:
        cnt = await db.scalar(select(func.count()).where(LabMember.lab_id == lab.id))
        out = LabOut.model_validate(lab)
        out.member_count = cnt or 0
        result.append(out)
    return result


@router.post("", response_model=LabOut)
async def create_lab(body: LabCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if body.goal_type not in ("task", "question"):
        raise HTTPException(400, "goal_type должен быть task или question")
    if not body.goal_id and not body.new_goal_title:
        raise HTTPException(400, "Укажите существующую цель (goal_id) или заголовок новой (new_goal_title)")

    slug = make_slug(body.name)
    existing = await db.scalar(select(func.count()).where(Lab.slug.like(f"{slug}%")))
    if existing:
        slug = f"{slug}-{existing}"

    lab = Lab(owner_id=user.id, name=body.name, slug=slug,
              description=body.description, is_public=body.is_public,
              open_join=body.open_join if body.is_public else False)
    db.add(lab)
    await db.flush()  # нужен lab.id до создания/привязки цели

    from app.models.entities import ResearchTask, Question
    GoalModel = ResearchTask if body.goal_type == "task" else Question

    if body.goal_id:
        goal = await get_live(db, GoalModel, body.goal_id)
        if not goal or goal.user_id != user.id:
            raise HTTPException(404, "Цель не найдена или не принадлежит вам")
        goal.lab_id = lab.id
        # Видимость цели (task или question) полностью наследуется от публичности
        # лабы (visibility_from_lab) — независимо от того, какой visibility была
        # запись раньше. Симметрично для обоих типов цели (было: только для task,
        # question оставался с висящей комбинацией lab_id+visibility="private" даже
        # для публичных лаб — см. ACCESS_POLICY.md).
        goal.visibility = visibility_from_lab(lab.is_public)
    else:
        if body.goal_type == "task":
            task_slug = await unique_slug_for(db, ResearchTask, body.new_goal_title)
            goal = ResearchTask(user_id=user.id, name=body.new_goal_title, slug=task_slug, lab_id=lab.id,
                                 visibility=visibility_from_lab(lab.is_public))
        else:
            question_slug = await unique_slug_for(db, Question, body.new_goal_title)
            goal = Question(user_id=user.id, title=body.new_goal_title, slug=question_slug,
                             date_created=date.today().isoformat(), lab_id=lab.id,
                             visibility=visibility_from_lab(lab.is_public))
        db.add(goal)
        await db.flush()

    lab.goal_type = body.goal_type
    lab.goal_id = goal.id

    db.add(LabMember(lab_id=lab.id, user_id=user.id, role="owner"))
    await db.commit()
    await db.refresh(lab)
    out = LabOut.model_validate(lab)
    out.member_count = 1
    out.role = "owner"
    return out


@router.get("/{lab_id}", response_model=LabOut)
async def get_lab(lab_id: str, user: Optional[User] = Depends(get_current_user_optional), db: AsyncSession = Depends(get_db)):
    lab_id = await _resolve_lab_id(db, lab_id)
    lab = await db.get(Lab, lab_id)
    if not lab:
        raise HTTPException(404, "Лаборатория не найдена")
    member = None
    if user:
        member = await db.scalar(select(LabMember).where(LabMember.lab_id == lab_id, LabMember.user_id == user.id))
    if not lab.is_public and not member:
        raise HTTPException(403 if user else 401, "Нет доступа")
    cnt = await db.scalar(select(func.count()).where(LabMember.lab_id == lab_id))
    # Единая политика подсчёта (см. ACCESS_POLICY.md, раздел "Один источник
    # правды на понятие"): все счётчики здесь считают РОВНО то же самое
    # множество, что покажут одноимённые вкладки лабы — прямой lab_id, без
    # union с goal-линками/графом. Раньше здесь было 3 независимые SQL-копии
    # с разной семантикой (прямой lab_id + goal + через гипотезы goal), они
    # расходились с тем, что реально показывал фронт, тремя разными спосо-
    # бами подряд. "Конкурирующие гипотезы" (через EntityHypothesis к цели)
    # — отдельное понятие, живёт в сайдбаре LabHypothesesRail, сюда не входит.
    obs_cnt = await db.scalar(select(func.count()).where(Observation.lab_id == lab_id, Observation.deleted_at.is_(None)))
    # Открытые через связь — отдельный счётчик «3 + 2» в бейдже таба; в строгий не входят.
    # Гость ничего не открывает, поэтому 0 без запроса. Цена: два плана по ~14 мс
    # (12 UNION-веток в opened_via_link_condition) на вызов /labs/{id}. На 2 юзерах —
    # нормально; при росте кэшировать (см. брифа «Известные недоработки», opened_via_link).
    viewer_id = user.id if user else None
    if viewer_id is not None:
        obs_opened_cnt = await db.scalar(select(func.count()).select_from(Observation).where(
            Observation.deleted_at.is_(None), opened_via_link_condition(Observation, "observation", viewer_id, lab_id=lab_id)))
        pred_opened_cnt = await db.scalar(select(func.count()).select_from(Prediction).where(
            Prediction.deleted_at.is_(None), opened_via_link_condition(Prediction, "prediction", viewer_id, lab_id=lab_id)))
    else:
        obs_opened_cnt = pred_opened_cnt = 0
    # Гипотезы: конкурирующие по цели (EntityHypothesis) — то же самое
    # множество, что видит сайдбар LabHypothesesRail. "Предложенные" (Hypothesis.
    # lab_id == lab_id, ещё не прикреплены) сюда не входят — у них своя очередь
    # и свой счётчик в интерфейсе, не общий "N гипотез".
    if lab.goal_type and lab.goal_id:
        hyp_cnt = await db.scalar(
            select(func.count(distinct(EntityHypothesis.hypothesis_id))).where(
                parent_alive_subquery("hypothesis", EntityHypothesis.hypothesis_id),
                EntityHypothesis.parent_type == lab.goal_type,
                EntityHypothesis.parent_id == lab.goal_id,
            )
        )
    else:
        hyp_cnt = 0
    pred_cnt = await db.scalar(select(func.count()).where(Prediction.lab_id == lab_id, Prediction.deleted_at.is_(None)))
    # Результаты — это сущность Result, а НЕ закрытые прогнозы (раньше считали
    # их, и бейдж расходился со вкладкой). Тот же запрос видимости, что у
    # GET /results, для текущего зрителя: число на бейдже == длина списка.
    res_cnt = await db.scalar(
        select(func.count()).select_from(
            (await visible_results_stmt(db, user.id if user else None, lab_id)).subquery()
        )
    )

    out = LabOut.model_validate(lab)
    out.member_count = cnt or 0
    out.observations_count = obs_cnt or 0
    out.observations_opened_count = obs_opened_cnt or 0
    out.hypotheses_count = hyp_cnt or 0
    out.predictions_count = pred_cnt or 0
    out.predictions_opened_count = pred_opened_cnt or 0
    out.results_count = res_cnt or 0
    out.role = member.role if member else None
    return out


@router.delete("/{lab_id}/leave")
async def leave_lab(lab_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    lab_id = await _resolve_lab_id(db, lab_id)
    member = await db.scalar(select(LabMember).where(LabMember.lab_id == lab_id, LabMember.user_id == user.id))
    if not member:
        raise HTTPException(404, "Вы не участник")
    if member.role == "owner":
        raise HTTPException(400, "Владелец не может покинуть лабораторию")
    # Согласие на открытие записей через связь давалось, пока владелец состоял в лаборатории: выход его снимает,
    # возврат не оживляет доступ молча.
    from sqlalchemy import delete as _delete
    from app.models.entities import RecordShare as _RS
    await db.execute(_delete(_RS).where(_RS.lab_id == lab_id, _RS.granted_by == user.id))
    await db.delete(member)
    await db.flush()  # строка участника исчезла до пересчёта: его голоса больше не считаются
    from app.services.hypothesis_evidence import recompute_lab_hypotheses
    await recompute_lab_hypotheses(db, lab_id)
    await db.commit()
    return {"ok": True}


@router.delete("/{lab_id}")
async def delete_lab(lab_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    lab_id = await _resolve_lab_id(db, lab_id)
    """Удалить лабораторию может только владелец. Участники и заявки удаляются
    каскадом (ondelete=CASCADE). Задачи/вопросы/гипотезы и т.п. не удаляются —
    просто теряют lab_id (ondelete=SET NULL)."""
    lab = await db.get(Lab, lab_id)
    if not lab:
        raise HTTPException(404, "Лаборатория не найдена")
    if lab.owner_id != user.id:
        raise HTTPException(403, "Только владелец лаборатории может её удалить")

    # entity.lab_id -> NULL при удалении лабы идёт каскадом на уровне БД
    # (ondelete=SET NULL), в обход resolve_lab_attachment. Без этого шага
    # запись осталась бы с visibility="lab" и lab_id=NULL — нелегальная
    # комбинация (ACCESS_POLICY.md, раздел про ATTACH; см. документ п.22).
    # Публичных записей (visibility="public") это не касается — публичная
    # лаба и так даёт entity visibility="public", это не меняется удалением лабы.
    from sqlalchemy import update as sa_update
    from app.models.entities import Observation, Hypothesis, Prediction, EntityHypothesis, Link, Worldview, Question, ResearchTask
    for model in (Observation, Hypothesis, Prediction, Worldview, Question, ResearchTask):
        await db.execute(
            sa_update(model).where(model.lab_id == lab_id, model.visibility == "lab").values(visibility="private")
        )

    # Следы лаборатории без FK: её стадия (entity_stages, тип "lab"), переводы её названия и описания и переводы
    # сообщений её заявок (сами заявки уходят каскадом по FK, а их переводы — нет). Каскад реестра знает только
    # 6 типов записей (backend/docs/EVENT_LOG_AND_CLEANUP.md), эти строки оставались сиротами.
    from sqlalchemy import delete as sa_delete
    from app.models.entities import EntityStage
    from app.models.i18n import ContentTranslation
    from app.models.social import LabJoinRequest
    req_ids = (await db.execute(select(LabJoinRequest.id).where(LabJoinRequest.lab_id == lab_id))).scalars().all()
    await db.execute(sa_delete(EntityStage).where(EntityStage.entity_type == "lab", EntityStage.entity_id == lab_id))
    await db.execute(sa_delete(ContentTranslation).where(ContentTranslation.entity_type == "lab", ContentTranslation.entity_id == lab_id))
    if req_ids:
        await db.execute(sa_delete(ContentTranslation).where(
            ContentTranslation.entity_type == "lab_join_request", ContentTranslation.entity_id.in_(req_ids)))

    await db.delete(lab)
    await db.commit()
    return {"ok": True}


@router.get("/{lab_id}/members", response_model=list[MemberOut])
async def get_members(lab_id: str, user: Optional[User] = Depends(get_current_user_optional), db: AsyncSession = Depends(get_db)):
    """Список участников лабы; каждый — с личным вкладом в калибровку лабы (01.10: было отдельной
    вкладкой/эндпоинтом /{lab_id}/calibration, объединено в один список по продуктовому решению —
    два параллельных списка одних и тех же людей выглядели избыточно). Не пагинировано: список
    участников и так никогда не пагинировался, сортировка — на фронте, по уже полученным данным.

    Калибровка видна только участникам лабы, не гостю/не-участнику публичной лабы (prediction.
    visibility='lab'/'public' внутри лабы и так не видны не-участнику в контенте — агрегат не
    должен приоткрывать то, что закрыто; см. прежний докстринг get_lab_calibration). Для такого
    зрителя n_closed=0, score_pct=None у всех — сам список имён остаётся виден, как и раньше."""
    lab_id = await _resolve_lab_id(db, lab_id)
    lab = await db.get(Lab, lab_id)
    if not lab:
        raise HTTPException(404, "Лаборатория не найдена")
    member = None
    if user:
        member = await db.scalar(select(LabMember).where(LabMember.lab_id == lab_id, LabMember.user_id == user.id))
    if not lab.is_public and not member:
        raise HTTPException(403 if user else 401, "Нет доступа")
    rows = await db.execute(
        select(LabMember, User)
        .join(User, LabMember.user_id == User.id)
        .where(LabMember.lab_id == lab_id)
    )
    members = list(rows)

    calib_by_user: dict[int, tuple[int, Optional[int]]] = {}
    if member:  # не-участнику публичной лабы калибровку не считаем и не отдаём
        by_user_rows = await rows_for_lab_by_user(db, lab_id)
        for uid, prows in by_user_rows.items():
            n = len(prows)
            result = calibration_score(prows, baseline=0.5) if n >= MIN_TAG_CALIBRATION_N else None
            calib_by_user[uid] = (n, round(result["score"] * 100) if result else None)

    return [
        MemberOut(
            user_id=u.id, username=u.username, display_name=u.display_name,
            avatar_url=u.avatar_url, role=m.role,
            n_closed=calib_by_user.get(u.id, (0, None))[0],
            score_pct=calib_by_user.get(u.id, (0, None))[1],
        )
        for m, u in members
    ]


@router.post("/{lab_id}/hypotheses/{hid}/attach")
async def attach_proposed_hypothesis(lab_id: str, hid: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Прикрепить предложенную гипотезу (lab_id=эта лаба, ещё не привязана к
    цели) к цели лабы — становится "конкурирующей" (EntityHypothesis). Только
    owner/admin лабы. Технически то же самое, что add_question_hyp/add_task_hyp,
    но вызывается со страницы лабы без похода на страницу цели."""
    lab_id_int = await _resolve_lab_id(db, lab_id)
    lab = await db.get(Lab, lab_id_int)
    if not lab:
        raise HTTPException(404, "Лаборатория не найдена")
    member = await db.scalar(select(LabMember).where(LabMember.lab_id == lab_id_int, LabMember.user_id == user.id))
    if not member or member.role not in ("owner", "admin"):
        raise HTTPException(403, "Недостаточно прав")
    if not lab.goal_type or not lab.goal_id:
        raise HTTPException(400, "У лабы нет цели")
    hyp = await get_live(db, Hypothesis, hid)
    if not hyp or hyp.lab_id != lab_id_int:
        raise HTTPException(404, "Гипотеза не найдена среди предложенных этой лабе")
    existing = await db.scalar(select(EntityHypothesis).where(
        EntityHypothesis.parent_type == lab.goal_type,
        EntityHypothesis.parent_id == lab.goal_id,
        EntityHypothesis.hypothesis_id == hid,
    ))
    if not existing:
        db.add(EntityHypothesis(parent_type=lab.goal_type, parent_id=lab.goal_id, hypothesis_id=hid))
        await db.commit()
    return {"ok": True}


@router.post("/{lab_id}/hypotheses/{hid}/reject")
async def reject_proposed_hypothesis(lab_id: str, hid: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Отклонить предложенную гипотезу — снимает lab_id, гипотеза пропадает
    из очереди предложений лабы, но НЕ удаляется (остаётся у автора как
    обычная приватная запись).

    ОСОЗНАННОЕ ИСКЛЮЧЕНИЕ из общего правила ACCESS_POLICY.md (LAB MANAGE:
    "не даёт права редактировать содержимое сущности... контент неприкосновенен
    для автора, даже для lab admin/owner"): здесь единственное затрагиваемое
    поле — lab_id, поле организационной принадлежности лабе, не контент
    гипотезы (name/description/falsification_criteria и т.п. не трогаются).
    Owner/admin лабы управляет составом ПРЕДЛОЖЕНИЙ лабе — симметрично праву
    прикреплять (attach выше) и праву не принимать заявку на вступление.
    Контент самой гипотезы по-прежнему редактируется только автором."""
    lab_id_int = await _resolve_lab_id(db, lab_id)
    member = await db.scalar(select(LabMember).where(LabMember.lab_id == lab_id_int, LabMember.user_id == user.id))
    if not member or member.role not in ("owner", "admin"):
        raise HTTPException(403, "Недостаточно прав")
    hyp = await get_live(db, Hypothesis, hid)
    if not hyp or hyp.lab_id != lab_id_int:
        raise HTTPException(404, "Гипотеза не найдена среди предложенных этой лабе")
    hyp.lab_id = None
    hyp.visibility = "private"
    await db.commit()
    return {"ok": True}


@router.patch("/{lab_id}/members/{member_user_id}/role")
async def set_member_role(lab_id: str, member_user_id: int, body: RoleUpdate,
                           user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    lab_id = await _resolve_lab_id(db, lab_id)
    lab = await db.get(Lab, lab_id)
    if not lab:
        raise HTTPException(404, "Лаборатория не найдена")
    if lab.owner_id != user.id:
        raise HTTPException(403, "Только владелец лабы может менять роли")
    if body.role not in ("admin", "member"):
        raise HTTPException(400, "role должен быть admin или member")
    member = await db.scalar(select(LabMember).where(LabMember.lab_id == lab_id, LabMember.user_id == member_user_id))
    if not member:
        raise HTTPException(404, "Участник не найден")
    if member.role == "owner":
        raise HTTPException(400, "Нельзя менять роль владельца")
    member.role = body.role
    await db.commit()
    return {"ok": True, "role": member.role}


# — Заявки на вступление —

@router.post("/{lab_id}/join-request")
async def create_join_request(lab_id: str, body: JoinRequestIn,
                               user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    lab_id = await _resolve_lab_id(db, lab_id)
    lab = await db.get(Lab, lab_id)
    if not lab:
        raise HTTPException(404, "Лаборатория не найдена")
    exists_member = await db.scalar(select(LabMember).where(LabMember.lab_id == lab_id, LabMember.user_id == user.id))
    if exists_member:
        raise HTTPException(400, "Вы уже участник")
    if lab.is_public and lab.open_join:
        db.add(LabMember(lab_id=lab_id, user_id=user.id, role="member"))
        await db.commit()
        return {"ok": True, "auto_joined": True}
    existing = await db.scalar(select(LabJoinRequest).where(LabJoinRequest.lab_id == lab_id, LabJoinRequest.user_id == user.id))
    if existing and existing.status == "pending":
        raise HTTPException(400, "Заявка уже отправлена")
    if existing:
        existing.status = "pending"
        existing.message = body.message
        existing.decline_reason = ""
    else:
        db.add(LabJoinRequest(lab_id=lab_id, user_id=user.id, message=body.message))
    await db.commit()
    return {"ok": True, "auto_joined": False}


@router.get("/{lab_id}/requests", response_model=list[JoinRequestOut])
async def list_join_requests(lab_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    lab_id = await _resolve_lab_id(db, lab_id)
    lab = await db.get(Lab, lab_id)
    if not lab:
        raise HTTPException(404, "Лаборатория не найдена")
    member = await db.scalar(select(LabMember).where(LabMember.lab_id == lab_id, LabMember.user_id == user.id))
    if not member or member.role not in ("owner", "admin"):
        raise HTTPException(403, "Только владелец/администратор видит заявки")
    rows = await db.execute(
        select(LabJoinRequest, User)
        .join(User, LabJoinRequest.user_id == User.id)
        .where(LabJoinRequest.lab_id == lab_id, LabJoinRequest.status == "pending")
        .order_by(LabJoinRequest.created_at.desc())
    )
    return [JoinRequestOut(id=r.id, user_id=u.id, username=u.username, display_name=u.display_name,
                            message=r.message, status=r.status, created_at=r.created_at.isoformat())
            for r, u in rows]


@router.post("/{lab_id}/requests/{req_id}/accept")
async def accept_join_request(lab_id: str, req_id: int,
                               user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    lab_id = await _resolve_lab_id(db, lab_id)
    lab = await db.get(Lab, lab_id)
    if not lab:
        raise HTTPException(404, "Лаборатория не найдена")
    member = await db.scalar(select(LabMember).where(LabMember.lab_id == lab_id, LabMember.user_id == user.id))
    if not member or member.role not in ("owner", "admin"):
        raise HTTPException(403, "Недостаточно прав")
    req = await db.get(LabJoinRequest, req_id)
    if not req or req.lab_id != lab_id:
        raise HTTPException(404, "Заявка не найдена")
    req.status = "accepted"
    exists = await db.scalar(select(LabMember).where(LabMember.lab_id == lab_id, LabMember.user_id == req.user_id))
    if not exists:
        db.add(LabMember(lab_id=lab_id, user_id=req.user_id, role="member"))
    await db.commit()
    return {"ok": True}


@router.post("/{lab_id}/requests/{req_id}/decline")
async def decline_join_request(lab_id: str, req_id: int, body: DeclineIn,
                                user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    lab_id = await _resolve_lab_id(db, lab_id)
    lab = await db.get(Lab, lab_id)
    if not lab:
        raise HTTPException(404, "Лаборатория не найдена")
    member = await db.scalar(select(LabMember).where(LabMember.lab_id == lab_id, LabMember.user_id == user.id))
    if not member or member.role not in ("owner", "admin"):
        raise HTTPException(403, "Недостаточно прав")
    req = await db.get(LabJoinRequest, req_id)
    if not req or req.lab_id != lab_id:
        raise HTTPException(404, "Заявка не найдена")
    req.status = "declined"
    req.decline_reason = body.reason
    await db.commit()
    return {"ok": True}


# ── Файлы записей лаборатории ────────────────────────────────────────────────
MAX_LAB_FILES = 500  # потолок ответа: список не пагинирован, лаба с тысячами файлов не должна вешать страницу


@router.get("/{lab_id}/signal")
async def lab_signal_summary(lab_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Сигнал по гипотезам лаборатории одним запросом (вкладка «Сигнал»): полоска до следующего уровня и список вкладов.
    Видят участники и владелец лаборатории (чужим 404). Личные числа владельца гипотезы (прогнозы и наблюдения вне
    лаборатории) получает только он сам. Все числа из тех же функций, что считают предложение зрелости."""
    from sqlalchemy import select as _select
    from app.api.v1.graph import _is_lab_participant
    from app.models.entities import Hypothesis, Observation, Prediction
    from app.core.prediction_status import CLOSED_PREDICTION_STATUSES
    from app.services.hypothesis_evidence import (
        BASE_THRESHOLDS, risk_multiplier, observation_evidence, signal_from_evidence,
        foreign_observation_signal, lab_total_signal, maturity_signal)

    lab_id_int = await _resolve_lab_id(db, lab_id)
    if not await _is_lab_participant(db, lab_id_int, user.id):
        raise HTTPException(404, "Лаборатория не найдена")
    hyps = (await db.execute(_select(Hypothesis).where(
        Hypothesis.lab_id == lab_id_int, Hypothesis.deleted_at.is_(None)).order_by(Hypothesis.id))).scalars().all()
    memo: dict = dict()  # общая память ОДНОГО запроса: создаётся здесь, не глобально
    out = []
    for hyp in hyps:
        items = []
        # deleted_at умышленно НЕ фильтруется: прогноз из корзины остаётся в сигнале (как в lab_signal)
        preds = (await db.execute(_select(Prediction).where(
            Prediction.hypothesis_id == hyp.id, Prediction.lab_id == hyp.lab_id,
            Prediction.lab_signal_contribution.is_not(None)))).scalars().all()
        for pr in preds:
            if pr.status not in CLOSED_PREDICTION_STATUSES:
                continue
            v = pr.lab_signal_contribution
            items.append({"type": "prediction", "id": pr.id, "title": pr.title or (pr.text or "")[:80], "value": v,
                          "mine": v if pr.user_id == user.id else 0.0, "votes": None})
        votes: dict = {}
        await foreign_observation_signal(db, hyp, votes, memo=memo)
        values = {oid: {"value": d["value"], "votes": {"n": d["n"], "mean": d["mean"]}} for oid, d in votes.items()}
        owner_ev = await observation_evidence(db, hyp.user_id, hyp.id, memo)
        for oid, sign, imp in owner_ev:
            values[oid] = {"value": signal_from_evidence([(oid, sign, imp)]), "votes": None}
        if values:
            obs = (await db.execute(_select(Observation).where(
                Observation.id.in_(values.keys()), Observation.lab_id == hyp.lab_id,
                Observation.deleted_at.is_(None)))).scalars().all()
            for o in obs:
                v = values[o.id]
                items.append({"type": "observation", "id": o.id, "title": o.title, "value": v["value"],
                              "mine": v["value"] if o.user_id == user.id else 0.0, "votes": v["votes"]})
        items.sort(key=lambda i: -abs(i["value"]))
        total = await lab_total_signal(db, hyp, memo)
        level = hyp.maturity or 0
        nxt = level + 1 if level + 1 < len(BASE_THRESHOLDS) else None
        row = {"id": hyp.id, "name": hyp.name, "maturity": level, "next_level": nxt,
               "next_threshold": BASE_THRESHOLDS[nxt] * risk_multiplier(hyp.risk) if nxt is not None else None,
               "lab_total": total, "contributions": items,
               # вклады окончательно удалённых прогнозов: строки нет, число живёт в «сухом остатке»
               "rest": total - sum(i["value"] for i in items)}
        if hyp.user_id == user.id:
            pred_p, obs_p, _lab, tot = await maturity_signal(db, hyp, memo)
            row.update({"pred_signal": pred_p, "obs_signal": obs_p, "total_signal": tot})
        out.append(row)
    return {"lab_id": lab_id_int, "hypotheses": out}


@router.get("/{lab_id}/files")
async def list_lab_files(lab_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Все файлы (вложения и картинки) ЖИВЫХ записей лаборатории с привязкой к записи — только участникам.
    Записи в корзине и удалённые вложения не показываются. Сами файлы и действия над ними — на странице записи."""
    import os
    from sqlalchemy import select as sa_select
    from app.api.v1.entity_stage import _TITLE_ATTR
    from app.core.entity_registry import ENTITY_MODELS
    from app.core.lab_access import _lab_role
    from app.models.entities import EntityAttachment, EntityImage

    lab_id = await _resolve_lab_id(db, lab_id)
    if not await _lab_role(db, lab_id, user.id):
        raise HTTPException(404, "Лаборатория не найдена")

    titles: dict[tuple[str, int], str] = {}
    by_type: dict[str, list[int]] = {}
    for etype, model in ENTITY_MODELS.items():
        rows = (await db.execute(
            sa_select(model.id, getattr(model, _TITLE_ATTR[etype])).where(model.lab_id == lab_id, model.deleted_at.is_(None))
        )).all()
        for rid, title in rows:
            titles[(etype, rid)] = title or ""
            by_type.setdefault(etype, []).append(rid)

    def base(etype: str, eid: int, uploader: int) -> dict:
        return {"entity_type": etype, "entity_id": eid, "entity_title": titles[(etype, eid)], "uploader_id": uploader}

    items: list[dict] = []
    for etype, ids in by_type.items():
        for a in (await db.execute(sa_select(EntityAttachment).where(
                EntityAttachment.entity_type == etype, EntityAttachment.entity_id.in_(ids),
                EntityAttachment.deleted_at.is_(None)))).scalars().all():
            items.append({**base(etype, a.entity_id, a.user_id), "kind": "attachment", "id": a.id, "name": a.filename,
                          "file_kind": a.kind, "mime_type": a.mime_type, "size_bytes": a.size_bytes, "created_at": a.created_at,
                          "download_url": f"/api/v1/attachments/{a.id}/download", "url": None, "thumb_url": None})
        for i in (await db.execute(sa_select(EntityImage).where(
                EntityImage.entity_type == etype, EntityImage.entity_id.in_(ids)))).scalars().all():
            name = (i.description or "").strip()[:80] or f"image-{i.id}{os.path.splitext(i.filename)[1]}"
            items.append({**base(etype, i.entity_id, i.user_id), "kind": "image", "id": i.id, "name": name,
                          "file_kind": "image", "mime_type": None, "size_bytes": i.size_bytes, "created_at": i.created_at,
                          "download_url": None, "url": f"/api/uploads/entity_images/{i.filename}",
                          "thumb_url": f"/api/uploads/entity_images/{i.thumb_filename}"})

    items.sort(key=lambda x: (x["created_at"], x["kind"], x["id"]), reverse=True)
    uploader_ids = {x["uploader_id"] for x in items}
    names = dict((await db.execute(sa_select(User.id, User.username).where(User.id.in_(uploader_ids)))).all()) if uploader_ids else {}
    for x in items:
        x["uploader_username"] = names.get(x["uploader_id"])
    return {"items": items[:MAX_LAB_FILES], "count": len(items), "truncated": len(items) > MAX_LAB_FILES,
            "total_bytes": sum(x["size_bytes"] or 0 for x in items)}
