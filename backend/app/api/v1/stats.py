from app.core.prediction_status import OPEN_PREDICTION_STATUS
from datetime import date, datetime, timedelta, timezone
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, and_, text
from app.core.prediction_status import CONFIRMED_PREDICTION_STATUSES
from app.db.session import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.entities import (
    Observation, Hypothesis, Prediction, Worldview,
    Question, ResearchTask, HypStatusHistory, Link, SourceDocument
)
import re

from app.core.lab_access import not_deleted, parent_alive_subquery, links_alive_sql
from app.services.calibration_source import calibration_status_counts, deleted_unverified_count

router = APIRouter(prefix="/stats", tags=["stats"])


def _clean_text(t: str, n: int = 80) -> str:
    """Убирает лишние пробелы/переносы, обрезает до n символов."""
    t = re.sub(r"\s+", " ", (t or "").strip())
    return t[:n] + ("…" if len(t) > n else "")


# ── Ранг практики и серия ────────────────────────────────────────────────
# Ранги — это НЕ выдуманные ачивки, а прямое отражение шкалы "Зрелость"
# из frontend/lib/scales.ts (DEFAULT_SCALES, entity_type="hypothesis").
# Если шкала когда-нибудь поменяется на фронте, эти лейблы нужно
# синхронизировать вручную (либо в будущем вынести в общий JSON/эндпоинт
# /api/v1/scales, который сейчас читает только фронт).
MATURITY_LEVELS = [
    "Интуиция",
    "Первые наблюдения",
    "Первичные подтверждения",
    "Многократно подтверждена",
    "Инфраструктурная",
]


async def _compute_streak(db: AsyncSession, uid: int) -> int:
    """
    Серия дней подряд с хотя бы одной записью любого типа.
    Если сегодня ещё ничего не записано — серия не обрывается сразу
    (день ещё не закончился), проверка идёт со вчерашнего дня.
    """
    rows = (await db.execute(text("""
        SELECT DISTINCT d::date AS day FROM (
            SELECT created_at AS d FROM observations    WHERE user_id = :uid AND deleted_at IS NULL
            UNION ALL SELECT created_at FROM hypotheses     WHERE user_id = :uid AND deleted_at IS NULL
            UNION ALL SELECT created_at FROM predictions    WHERE user_id = :uid AND deleted_at IS NULL
            UNION ALL SELECT created_at FROM worldview      WHERE user_id = :uid AND deleted_at IS NULL
            UNION ALL SELECT created_at FROM questions      WHERE user_id = :uid AND deleted_at IS NULL
            UNION ALL SELECT created_at FROM research_tasks WHERE user_id = :uid AND deleted_at IS NULL
        ) t
        ORDER BY day DESC
        LIMIT 400
    """), {"uid": uid})).all()

    days = {r[0] for r in rows}
    if not days:
        return 0

    cursor = date.today()
    if cursor not in days:
        cursor -= timedelta(days=1)

    streak = 0
    while cursor in days:
        streak += 1
        cursor -= timedelta(days=1)
    return streak


async def _compute_practice_rank(db: AsyncSession, uid: int) -> dict | None:
    """
    Ранг = медиана зрелости всех гипотез пользователя (0..4), округлённая
    вниз до уровня шкалы. Дробная часть медианы = прогресс до следующего
    уровня в процентах. Возвращает None для нового пользователя без гипотез —
    рендерится отдельным "чистым" состоянием на фронте, а не нулевым рангом.
    """
    row = (await db.execute(text("""
        SELECT
            percentile_cont(0.5) WITHIN GROUP (ORDER BY maturity) AS median_maturity,
            COUNT(*) AS total
        FROM hypotheses
        WHERE user_id = :uid AND is_onboarding = false AND deleted_at IS NULL
    """), {"uid": uid})).first()

    if row is None or not row.total or row.median_maturity is None:
        return None

    median = float(row.median_maturity)
    level_idx = max(0, min(int(median), len(MATURITY_LEVELS) - 1))
    progress = median - level_idx

    return {
        "level_index":  level_idx,
        "label":        MATURITY_LEVELS[level_idx],
        "next_label":   MATURITY_LEVELS[level_idx + 1] if level_idx + 1 < len(MATURITY_LEVELS) else None,
        "progress_pct": round(progress * 100),
        "sample_size":  row.total,
    }


@router.get("/")
async def get_stats(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    uid = user.id

    async def count(model):
        r = await db.execute(select(func.count()).select_from(model).where(model.user_id == uid, not_deleted(model)))
        return r.scalar()

    totals = {
        "observations": await count(Observation),
        "hypotheses":   await count(Hypothesis),
        "predictions":  await count(Prediction),
        "worldview":    await count(Worldview),
        "questions":    await count(Question),
        "tasks":        await count(ResearchTask),
    }

    hyp_by_status = {
        r[0]: r[1] for r in (await db.execute(
            select(Hypothesis.status, func.count()).where(Hypothesis.user_id == uid, Hypothesis.is_onboarding == False, Hypothesis.deleted_at.is_(None))
            .group_by(Hypothesis.status)
        )).all()
    }

    pred_by_status = {
        r[0]: r[1] for r in (await db.execute(
            select(Prediction.status, func.count()).where(Prediction.user_id == uid, Prediction.is_onboarding == False, Prediction.deleted_at.is_(None))
            .group_by(Prediction.status)
        )).all()
    }
    calib_by_status = await calibration_status_counts(db, uid)  # живые + корзина + остатки окончательно удалённых
    checked   = sum(v for k, v in calib_by_status.items() if k != OPEN_PREDICTION_STATUS)
    confirmed = sum(v for k, v in calib_by_status.items() if k in CONFIRMED_PREDICTION_STATUSES)
    pred_accuracy = round(confirmed / checked * 100, 1) if checked else 0

    wv_by_status = {
        r[0]: r[1] for r in (await db.execute(
            select(Worldview.status, func.count()).where(Worldview.user_id == uid, Worldview.deleted_at.is_(None))
            .group_by(Worldview.status)
        )).all()
    }

    status_history = (await db.execute(
        select(HypStatusHistory.status, HypStatusHistory.changed_at)
        .join(Hypothesis, Hypothesis.id == HypStatusHistory.hypothesis_id)
        .where(Hypothesis.user_id == uid, Hypothesis.deleted_at.is_(None))
        .order_by(HypStatusHistory.changed_at)
    )).all()

    return {
        "totals":         totals,
        "hyp_by_status":  hyp_by_status,
        "pred_by_status": pred_by_status,
        "pred_accuracy":  pred_accuracy,
        "wv_by_status":   wv_by_status,
        "status_history": [{"status": r[0], "changed_at": r[1]} for r in status_history],
    }


@router.get("/dashboard")
async def get_dashboard(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    uid = user.id

    async def count(model):
        r = await db.execute(select(func.count()).select_from(model).where(model.user_id == uid, not_deleted(model)))
        return r.scalar()

    # ── Totals ───────────────────────────────────────────────────────────
    totals = {
        "observations": await count(Observation),
        "hypotheses":   await count(Hypothesis),
        "predictions":  await count(Prediction),
        "questions":    await count(Question),
        "tasks":        await count(ResearchTask),
        "worldview":    await count(Worldview),
    }

    # ── Гипотезы по статусу ──────────────────────────────────────────────
    hyp_by_status = {
        r[0]: r[1] for r in (await db.execute(
            select(Hypothesis.status, func.count())
            .where(Hypothesis.user_id == uid, Hypothesis.is_onboarding == False, Hypothesis.deleted_at.is_(None))
            .group_by(Hypothesis.status)
        )).all()
    }

    # ── Точность прогнозов ───────────────────────────────────────────────
    calib_by_status = await calibration_status_counts(db, uid)  # живые + корзина + остатки окончательно удалённых
    checked   = sum(v for k, v in calib_by_status.items() if k != OPEN_PREDICTION_STATUS)
    confirmed = sum(v for k, v in calib_by_status.items() if k in CONFIRMED_PREDICTION_STATUSES)
    pred_accuracy = round(confirmed / checked * 100, 1) if checked else None
    pred_deleted_unverified = await deleted_unverified_count(db, uid, uid)  # вариант В: «удалено до проверки»

    # ── Баланс доказательств (SQL, не Python-цикл) ───────────────────────
    link_counts = (await db.execute(text(f"""
        SELECT
            h.id,
            h.name,
            h.status,
            COUNT(CASE WHEN l.link_type = 'подтверждает' THEN 1 END) AS conf,
            COUNT(CASE WHEN l.link_type = 'опровергает'  THEN 1 END) AS ref_
        FROM hypotheses h
        LEFT JOIN links l ON (
            (l.from_type = 'hypothesis' AND l.from_id = h.id)
            OR
            (l.to_type = 'hypothesis' AND l.to_id = h.id)
        ) AND l.user_id = :uid AND {links_alive_sql('l')}
        WHERE h.user_id = :uid AND h.deleted_at IS NULL
        GROUP BY h.id, h.name, h.status
        HAVING COUNT(CASE WHEN l.link_type IN ('подтверждает','опровергает') THEN 1 END) > 0
        ORDER BY ABS(
            COUNT(CASE WHEN l.link_type = 'подтверждает' THEN 1 END) -
            COUNT(CASE WHEN l.link_type = 'опровергает'  THEN 1 END)
        ) DESC
        LIMIT 10
    """), {"uid": uid})).all()

    evidence_balance = [
        {
            "id":     r[0],
            "name":   r[1],
            "status": r[2],
            "conf":   r[3],
            "ref":    r[4],
            "score":  r[3] - r[4],
        }
        for r in link_counts
    ]

    # ── Прогнозы по гипотезам ────────────────────────────────────────────
    preds_by_hyp_rows = (await db.execute(
        select(Prediction, Hypothesis.name.label("hyp_name"))
        .join(Hypothesis, Hypothesis.id == Prediction.hypothesis_id)
        .where(
            Prediction.user_id == uid,
            Prediction.hypothesis_id.isnot(None),
            Prediction.deleted_at.is_(None), Hypothesis.deleted_at.is_(None),
        )
        .order_by(Prediction.created_at.desc())
        .limit(10)
    )).all()

    preds_by_hyp = [
        {
            "id":         p.Prediction.id,
            "title":      _clean_text(p.Prediction.title or p.Prediction.text, 80),
            "status":     p.Prediction.status,
            "hyp_name":   _clean_text(p.hyp_name, 50),
            "hyp_id":     p.Prediction.hypothesis_id,
            "check_date": p.Prediction.expected_check_date.isoformat() if p.Prediction.expected_check_date else "",
        }
        for p in preds_by_hyp_rows
    ]

    # ── Последняя активность ─────────────────────────────────────────────
    recent_obs = (await db.execute(
        select(Observation).where(Observation.user_id == uid, Observation.deleted_at.is_(None))
        .order_by(Observation.created_at.desc()).limit(5)
    )).scalars().all()

    recent_hyps = (await db.execute(
        select(Hypothesis).where(Hypothesis.user_id == uid, Hypothesis.deleted_at.is_(None))
        .order_by(Hypothesis.created_at.desc()).limit(4)
    )).scalars().all()

    recent_preds = (await db.execute(
        select(Prediction).where(Prediction.user_id == uid, Prediction.deleted_at.is_(None))
        .order_by(Prediction.created_at.desc()).limit(3)
    )).scalars().all()

    recent_activity = []
    for o in recent_obs:
        recent_activity.append({
            "type":  "observation",
            "id":    o.id,
            "title": _clean_text(o.title or o.text, 80),
            "date":  o.created_at.date().isoformat() if o.created_at else "",
        })
    for h in recent_hyps:
        recent_activity.append({
            "type":   "hypothesis",
            "id":     h.id,
            "title":  _clean_text(h.name, 80),
            "status": h.status,
            "date":   h.created_at.date().isoformat() if h.created_at else "",
        })
    for p in recent_preds:
        recent_activity.append({
            "type":   "prediction",
            "id":     p.id,
            "title":  _clean_text(p.title or p.text, 80),
            "status": p.status,
            "date":   p.created_at.date().isoformat() if p.created_at else "",
        })
    recent_activity.sort(key=lambda x: x["date"], reverse=True)
    recent_activity = recent_activity[:12]

    # ── Срочные прогнозы ─────────────────────────────────────────────────
    # Совпадает с getUrgency() на фронте: просрочен либо до проверки ≤7 дней.
    soon_cutoff = datetime.now(timezone.utc) + timedelta(days=7)
    urgent_preds_rows = (await db.execute(
        select(Prediction, Hypothesis.name.label("hyp_name"))
        .outerjoin(Hypothesis, and_(Hypothesis.id == Prediction.hypothesis_id, Hypothesis.deleted_at.is_(None)))
        .where(
            Prediction.user_id == uid,
            Prediction.deleted_at.is_(None),
            Prediction.status == OPEN_PREDICTION_STATUS,
            Prediction.expected_check_date.is_not(None),
            Prediction.expected_check_date <= soon_cutoff,
        ).order_by(Prediction.expected_check_date).limit(10)
    )).all()

    # ── Открытые вопросы ─────────────────────────────────────────────────
    open_questions = (await db.execute(
        select(Question).where(
            Question.user_id == uid,
            Question.deleted_at.is_(None),
            Question.status == "открыт",
        ).order_by(Question.date_created.desc()).limit(5)
    )).scalars().all()

    # ── Активные задачи ──────────────────────────────────────────────────
    active_tasks = (await db.execute(
        select(ResearchTask).where(
            ResearchTask.user_id == uid,
            ResearchTask.deleted_at.is_(None),
            ResearchTask.status.in_(["открыта", "исследуется"]),
        ).order_by(ResearchTask.created_at.desc()).limit(5)
    )).scalars().all()

    # ── Незакрытые петли (чистый SQL) ────────────────────────────────────
    hyps_no_obs_rows = (await db.execute(text(f"""
        SELECT h.id, h.name FROM hypotheses h
        WHERE h.user_id = :uid AND h.is_onboarding = false AND h.deleted_at IS NULL
        AND NOT EXISTS (
            SELECT 1 FROM links l WHERE l.user_id = :uid AND {links_alive_sql('l')} AND (
                (l.from_type = 'hypothesis' AND l.from_id = h.id AND l.to_type = 'observation')
                OR
                (l.to_type = 'hypothesis' AND l.to_id = h.id AND l.from_type = 'observation')
            )
        )
        ORDER BY h.created_at DESC
        LIMIT 6
    """), {"uid": uid})).all()

    hyps_no_pred_rows = (await db.execute(text("""
        SELECT h.id, h.name FROM hypotheses h
        WHERE h.user_id = :uid AND h.is_onboarding = false AND h.deleted_at IS NULL
        AND NOT EXISTS (
            SELECT 1 FROM predictions p
            WHERE p.user_id = :uid AND p.hypothesis_id = h.id AND p.deleted_at IS NULL
        )
        ORDER BY h.created_at DESC
        LIMIT 5
    """), {"uid": uid})).all()

    preds_no_date_rows = (await db.execute(
        select(Prediction).where(
            Prediction.user_id == uid,
            Prediction.deleted_at.is_(None),
            Prediction.status == OPEN_PREDICTION_STATUS,
            Prediction.expected_check_date.is_(None),
            Prediction.is_onboarding == False,
        ).order_by(Prediction.created_at.desc()).limit(5)
    )).scalars().all()

    questions_no_answer = (await db.execute(
        select(Question).where(
            Question.user_id == uid,
            Question.deleted_at.is_(None),
            Question.status == "открыт",
            Question.answer == "",
        ).order_by(Question.date_created.desc()).limit(5)
    )).scalars().all()

    worldview_no_reflection_rows = (await db.execute(text("""
        SELECT w.id, w.belief FROM worldview w
        WHERE w.user_id = :uid AND w.deleted_at IS NULL
        AND NOT EXISTS (
            SELECT 1 FROM prediction_reflections r
            WHERE r.entity_type = 'worldview' AND r.entity_id = w.id
        )
        ORDER BY w.date DESC
        LIMIT 5
    """), {"uid": uid})).all()

    # ── Источники ────────────────────────────────────────────────────────
    src_rows = (await db.execute(
        select(SourceDocument.verdict, func.count())
        .where(SourceDocument.user_id == uid, SourceDocument.status == "done",
                parent_alive_subquery(SourceDocument.entity_type, SourceDocument.entity_id))
        .group_by(SourceDocument.verdict)
    )).all()
    sources_summary = {r[0]: r[1] for r in src_rows}
    sources_total = (await db.execute(
        select(func.count()).select_from(SourceDocument).where(SourceDocument.user_id == uid,
            parent_alive_subquery(SourceDocument.entity_type, SourceDocument.entity_id))
    )).scalar()

    # ── Ранг практики и серия (новое) ─────────────────────────────────────
    streak_days   = await _compute_streak(db, uid)
    practice_rank = await _compute_practice_rank(db, uid)

    return {
        "totals":           totals,
        "hyp_by_status":    hyp_by_status,
        "pred_accuracy":    pred_accuracy,
        "pred_checked":     checked,
        "pred_deleted_unverified": pred_deleted_unverified,
        "evidence_balance": evidence_balance,
        "preds_by_hyp":     preds_by_hyp,
        "recent_activity":  recent_activity,
        "streak_days":      streak_days,
        "practice_rank":    practice_rank,
        "urgent_preds": [
            {
                "entity_type":   "prediction",
                "id":            p.Prediction.id,
                "title":         _clean_text(p.Prediction.title or p.Prediction.text, 80),
                "text":          p.Prediction.text,
                "check_date":    p.Prediction.expected_check_date.isoformat() if p.Prediction.expected_check_date else None,
                "confidence":    p.Prediction.confidence,
                "hypothesis_id": p.Prediction.hypothesis_id,
                "confirms_hypothesis_if_true": p.Prediction.confirms_hypothesis_if_true,  # направление: стресс-тест или обычный
                "hyp_name":      p.hyp_name,
                "is_onboarding": p.Prediction.is_onboarding,
            }
            for p in urgent_preds_rows
        ],
        "open_questions": [
            {"entity_type": "question", "id": q.id, "title": q.title, "priority": q.priority}
            for q in open_questions
        ],
        "active_tasks": [
            {"id": t.id, "name": t.name, "status": t.status}
            for t in active_tasks
        ],
        "loops": {
            "hyps_no_obs":    [{"id": r[0], "name": r[1]} for r in hyps_no_obs_rows],
            "hyps_no_pred":   [{"id": r[0], "name": r[1]} for r in hyps_no_pred_rows],
            "preds_no_date":  [{"id": p.id, "title": _clean_text(p.title or p.text, 70)} for p in preds_no_date_rows],
            "questions_no_answer": [{"id": q.id, "title": q.title} for q in questions_no_answer],
            "worldview_no_reflection": [{"id": r[0], "name": _clean_text(r[1], 70)} for r in worldview_no_reflection_rows],
        },
        "sources_summary": sources_summary,
        "sources_total":   sources_total,
    }
