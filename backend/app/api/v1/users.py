from app.core.hypothesis_status import CONFIRMED_HYPOTHESIS_STATUSES, PENDING_HYPOTHESIS_STATUSES, REJECTED_HYPOTHESIS_STATUSES
from app.core.prediction_status import OPEN_PREDICTION_STATUS
from datetime import datetime, timedelta, timezone
from datetime import datetime as _dt
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, and_
from app.core.prediction_status import CONFIRMED_PREDICTION_STATUSES
from app.db.session import get_db
from app.models.user import User
from app.models.entities import Hypothesis, Observation, Prediction, Worldview, Question, ScaleDef, ScaleValue, UserThinkingPattern, ResearchTask, Link, Tag, EntityTag
from app.models.social import Lab, LabMember
from app.core.lab_access import entity_visibility_filter
from app.services.calibration_source import calibration_rows, deleted_unverified_count, calibration_score
from app.core.deps import get_current_user, get_current_user_optional
from pydantic import BaseModel, StrictBool
from app.schemas._strict import StrictIn

router = APIRouter(prefix="/users", tags=["users"])


class ThinkingPatternOut(BaseModel):
    id: int
    summary: str
    based_on_count: int
    created_at: _dt


@router.get("/me/thinking-patterns", response_model=list[ThinkingPatternOut])
async def list_thinking_patterns(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Лента агрегирующих обзоров паттернов мышления — строго приватная,
    без пагинации (append-only лента, генерируется по накоплению данных,
    не по запросу пользователя — см. review.md п.12/15)."""
    rows = (await db.execute(
        select(UserThinkingPattern)
        .where(UserThinkingPattern.user_id == user.id)
        .order_by(UserThinkingPattern.created_at.desc())
    )).scalars().all()
    return rows


class ProfileOut(BaseModel):
    id: int
    username: str
    display_name: str
    bio: str
    avatar_url: str | None = None
    created_at: datetime
    model_config = {"from_attributes": True}


@router.get("/me", response_model=ProfileOut)
async def get_me(user: User = Depends(get_current_user)):
    return user


@router.get("/{username}", response_model=ProfileOut)
async def get_profile(username: str, db: AsyncSession = Depends(get_db),
    user: Optional[User] = Depends(get_current_user_optional)):
    u = (await db.execute(select(User).where(User.username == username))).scalar_one_or_none()
    if not u:
        raise HTTPException(404, "Пользователь не найден")
    return u


CONFIRMED_STATUSES = set(CONFIRMED_HYPOTHESIS_STATUSES)
PENDING_STATUSES   = set(PENDING_HYPOTHESIS_STATUSES)
REJECTED_STATUSES  = set(REJECTED_HYPOTHESIS_STATUSES)

PRED_TRUE_STATUSES = set(CONFIRMED_PREDICTION_STATUSES)
PRED_UNRESOLVED     = {OPEN_PREDICTION_STATUS}

FIXED_SCALES = [
    ("maturity",      "Зрелость"),
    ("stability",     "Стабильность"),
    ("research_load", "Нагрузка"),
    ("risk",          "Риск"),
]


async def _visibility_filter(db: AsyncSession, model, is_owner: bool, viewer_id: int,
                              requested: set[str] | None, lab_id: int | None):
    """
    Возвращает SQLAlchemy-условие видимости для модели с полями visibility/lab_id.
    Раньше здесь была отдельная копия политики доступа (owner/public/lab-
    членство) — независимая от entity_visibility_filter в lab_access.py, хотя
    базовое условие было тождественно ему (публичные лабы и так дают
    entity.visibility="public" напрямую через resolve_lab_attachment, так что
    отдельный учёт public_lab_ids был избыточен). Теперь делегирует туда,
    добавляя только то, чего там не было: requested (сужение набора уровней
    видимости) и lab_id (сужение lab-ветки до конкретной лабы) — оба параметра
    сведены в сами kwargs entity_visibility_filter.

    is_owner=True (viewer смотрит свой профиль) корректно даёт полный доступ
    без явного разбора: entity_visibility_filter содержит ветку
    model.user_id == user_id, которая в контексте вызывающего кода (см.
    get_profile_stats: .where(model.user_id == uid, cond)) тождественна
    полному доступу владельца, когда uid == viewer_id.
    """
    return entity_visibility_filter(model, viewer_id, requested=requested, lab_id=lab_id)


@router.get("/{username}/stats")
async def get_profile_stats(
    username: str,
    visibility: str | None = Query(None, description="через запятую: private,lab,public"),
    lab_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
    viewer: Optional[User] = Depends(get_current_user_optional),
):
    u = (await db.execute(select(User).where(User.username == username))).scalar_one_or_none()
    if not u:
        raise HTTPException(404, "Пользователь не найден")
    uid = u.id
    viewer_id = viewer.id if viewer else None
    is_owner = viewer_id == uid
    requested = set(v.strip() for v in visibility.split(",") if v.strip()) if visibility else None

    async def vis_cond(model):
        return await _visibility_filter(db, model, is_owner, viewer_id, requested, lab_id)

    async def count(model):
        cond = await vis_cond(model)
        r = await db.execute(select(func.count()).select_from(model).where(model.user_id == uid, cond))
        return r.scalar() or 0

    totals = {
        "hypotheses":   await count(Hypothesis),
        "observations": await count(Observation),
        "predictions":  await count(Prediction),
        "worldview":    await count(Worldview),
        "questions":    await count(Question),
    }

    hyp_cond = await vis_cond(Hypothesis)
    hyp_status_rows = (await db.execute(
        select(Hypothesis.status, func.count()).where(Hypothesis.user_id == uid, hyp_cond).group_by(Hypothesis.status)
    )).all()
    fingerprint = {"confirmed": 0, "pending": 0, "rejected": 0}
    for status, n in hyp_status_rows:
        if status in CONFIRMED_STATUSES:
            fingerprint["confirmed"] += n
        elif status in REJECTED_STATUSES:
            fingerprint["rejected"] += n
        else:
            fingerprint["pending"] += n

    radar = []
    for field, label in FIXED_SCALES:
        avg = (await db.execute(
            select(func.avg(getattr(Hypothesis, field))).where(Hypothesis.user_id == uid, hyp_cond)
        )).scalar()
        if avg is not None:
            radar.append({"key": field, "label": label, "value_pct": round(float(avg) / 10 * 100)})

    # ScaleValue не имеет FK-колонки hypothesis_id — она полиморфная (entity_type/entity_id,
    # как у EntityComment/EntityTag), а scale_id кастомной шкалы хранится строкой "custom_<id>"
    # (см. scales.py::delete_custom_scale). Радар — только по шкалам для гипотез.
    scale_defs = (await db.execute(
        select(ScaleDef).where(ScaleDef.user_id == uid, ScaleDef.entity_type == "hypothesis")
    )).scalars().all()
    for sd in scale_defs:
        avg = (await db.execute(
            select(func.avg(ScaleValue.value))
            .join(Hypothesis, Hypothesis.id == ScaleValue.entity_id)
            .where(
                ScaleValue.entity_type == "hypothesis", ScaleValue.scale_id == f"custom_{sd.id}",
                ScaleValue.user_id == uid, Hypothesis.user_id == uid, hyp_cond,
            )
        )).scalar()
        if avg is not None and sd.max_val > sd.min_val:
            pct = (float(avg) - sd.min_val) / (sd.max_val - sd.min_val) * 100
            radar.append({"key": f"scale_{sd.id}", "label": sd.name, "value_pct": round(pct)})

    # Калибровка учитывает и прогнозы из корзины, и «остатки» окончательно удалённых:
    # удалением track record не «улучшить» (решение продукта). Видимость — та же политика.
    pred_rows = await calibration_rows(db, uid, viewer_id, requested=requested, lab_id=lab_id,
                                       unresolved=PRED_UNRESOLVED)
    buckets = [(0, 20), (20, 40), (40, 60), (60, 80), (80, 101)]
    calibration = []
    for lo, hi in buckets:
        in_bucket = [s for c, s in pred_rows if lo <= c < hi]
        if not in_bucket:
            continue
        true_count = sum(1 for s in in_bucket if s in PRED_TRUE_STATUSES)
        calibration.append({
            "bucket_label": f"{lo}–{min(hi, 100)}%",
            "predicted_mid": (lo + min(hi, 100)) // 2,
            "actual_pct": round(true_count / len(in_bucket) * 100),
            "count": len(in_bucket),
        })

    # Сводный балл калибровки по видимой сейчас выборке прогнозов (та же pred_rows,
    # что и для бакетов выше) — calibration_score (calibration_source.py), общая формула
    # с multiplier'ом гипотезы и лидербордом калибровки лабы. Собственного агрегата у
    # /stats нет — произвольную комбинацию разрезов (например "публичное + две конкретные
    # лабы"), которую мог выбрать пользователь через фильтр видимости, посчитать заранее
    # в отдельной таблице нельзя, только на лету по факту запроса.
    deleted_unverified = await deleted_unverified_count(db, uid, viewer_id, requested=requested, lab_id=lab_id)
    calibration_summary = None
    result = calibration_score(pred_rows, baseline=0.5)
    if result:
        calibration_summary = {
            "score_pct": round(result["score"] * 100),
            "n_closed": result["n_closed"],
            "confidence_pct": round(result["z"] * 100),
            "deleted_unverified": deleted_unverified,
        }

    since = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=150)
    activity_map: dict[str, int] = {}
    for model in (Hypothesis, Observation, Prediction, Worldview, Question):
        cond = await vis_cond(model)
        rows = (await db.execute(
            select(func.date(model.created_at), func.count())
            .where(model.user_id == uid, model.created_at >= since, cond)
            .group_by(func.date(model.created_at))
        )).all()
        for d, n in rows:
            key = str(d)
            activity_map[key] = activity_map.get(key, 0) + n
    activity = [{"date": d, "count": n} for d, n in sorted(activity_map.items())]

    # Последние публичные (по текущему фильтру видимости) записи каждого типа —
    # для секций "недавняя активность" на странице профиля. Переиспользуем тот
    # же vis_cond, что и для totals/бакетов выше — единый источник правды о видимости.
    RECENT_CONFIG = [
        ("hypotheses",   Hypothesis,  "name",   "/hypotheses"),
        ("observations", Observation, "title",  "/observations"),
        ("predictions",  Prediction,  "title",  "/predictions"),
        ("worldview",    Worldview,   "belief", "/worldview"),
        ("questions",    Question,    "title",  "/questions"),
    ]
    recent: dict[str, list[dict]] = {}
    for key, model, title_field, href_base in RECENT_CONFIG:
        cond = await vis_cond(model)
        rows = (await db.execute(
            select(model.id, model.slug, getattr(model, title_field), model.created_at)
            .where(model.user_id == uid, cond)
            .order_by(model.created_at.desc())
            .limit(5)
        )).all()
        recent[key] = [
            {"id": r[0], "slug": r[1], "title": r[2], "created_at": r[3].isoformat() if hasattr(r[3], "isoformat") else r[3], "href": f"{href_base}?id={r[1] or r[0]}&tab=detail"}
            for r in rows
        ]

    return {
        "totals": totals,
        "fingerprint": fingerprint,
        "radar": radar,
        "calibration": calibration,
        "calibration_summary": calibration_summary,
        "recent": recent,
        "activity": activity,
        "is_owner": is_owner,
    }


# ── Notification preferences ────────────────────────────────────────────
from app.models.user import NotificationPrefs


class NotifPrefsOut(BaseModel):
    new_messages: bool
    comments: bool
    prediction_reminders: bool
    model_config = {"from_attributes": True}


@router.get("/me/notification-prefs", response_model=NotifPrefsOut)
async def get_notification_prefs(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    prefs = (await db.execute(select(NotificationPrefs).where(NotificationPrefs.user_id == user.id))).scalar_one_or_none()
    if not prefs:
        prefs = NotificationPrefs(user_id=user.id)
        db.add(prefs)
        await db.commit()
        await db.refresh(prefs)
    return prefs


class NotifPrefsUpdate(StrictIn):
    """Только булевы значения; пропущенное поле остаётся как есть (раньше bool("false") давал True)."""
    new_messages: Optional[StrictBool] = None
    comments: Optional[StrictBool] = None
    prediction_reminders: Optional[StrictBool] = None


@router.patch("/me/notification-prefs", response_model=NotifPrefsOut)
async def update_notification_prefs(body: NotifPrefsUpdate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    prefs = (await db.execute(select(NotificationPrefs).where(NotificationPrefs.user_id == user.id))).scalar_one_or_none()
    if not prefs:
        prefs = NotificationPrefs(user_id=user.id)
        db.add(prefs)
    for key in ("new_messages", "comments", "prediction_reminders"):
        if getattr(body, key) is not None:
            setattr(prefs, key, getattr(body, key))
    await db.commit()
    await db.refresh(prefs)
    return prefs


# ── Export ────────────────────────────────────────────────────────────────
@router.get("/me/export")
async def export_my_data(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    async def dump(model):
        rows = (await db.execute(select(model).where(model.user_id == user.id))).scalars().all()
        return [
            {c.name: getattr(r, c.name) for c in model.__table__.columns}
            for r in rows
        ]

    async def dump_entity_tags():
        # у привязки тега нет user_id: свои привязки находим через свои теги
        rows = (await db.execute(
            select(EntityTag).where(EntityTag.tag_id.in_(select(Tag.id).where(Tag.user_id == user.id)))
        )).scalars().all()
        return [{c.name: getattr(r, c.name) for c in EntityTag.__table__.columns} for r in rows]

    data = {
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "user": {"username": user.username, "display_name": user.display_name, "email": user.email},
        "hypotheses":   await dump(Hypothesis),
        "observations": await dump(Observation),
        "predictions":  await dump(Prediction),
        "worldview":    await dump(Worldview),
        "questions":    await dump(Question),
        "tasks":        await dump(ResearchTask),
        "links":        await dump(Link),
        "tags":         await dump(Tag),
        "entity_tags":  await dump_entity_tags(),
        "scale_defs":   await dump(ScaleDef),
        "scale_values": await dump(ScaleValue),
    }
    return data


# ── Avatar upload ────────────────────────────────────────────────────────
import os
import uuid
from fastapi import UploadFile, File
from app.schemas.auth import UserOut
from starlette.concurrency import run_in_threadpool
from app.services.image_processing import process_avatar

AVATAR_DIR = "uploads/avatars"
ALLOWED_TYPES = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}
MAX_AVATAR_SIZE = 5 * 1024 * 1024  # 5MB


@router.post("/me/avatar", response_model=UserOut)
async def upload_avatar(file: UploadFile = File(...), user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(400, "Разрешены только JPEG, PNG или WebP")

    data = await file.read()
    if len(data) > MAX_AVATAR_SIZE:
        raise HTTPException(400, "Файл больше 5 МБ")

    # Сначала обработка: так битый файл не удалит прежний аватар, а на диск попадает только маленький WebP.
    try:
        data = await run_in_threadpool(process_avatar, data)
    except ValueError:
        raise HTTPException(400, "Не удалось прочитать изображение")

    os.makedirs(AVATAR_DIR, exist_ok=True)

    if user.avatar_url:
        old_path = user.avatar_url.replace("/api/uploads/", "uploads/", 1)
        if os.path.isfile(old_path):
            os.remove(old_path)

    ext = "webp"   # после обработки это всегда WebP, какой бы тип ни прислал клиент
    filename = f"{user.id}_{uuid.uuid4().hex}.{ext}"
    filepath = f"{AVATAR_DIR}/{filename}"
    with open(filepath, "wb") as f:
        f.write(data)

    user.avatar_url = f"/api/uploads/avatars/{filename}"
    await db.commit()
    await db.refresh(user)
    return user
