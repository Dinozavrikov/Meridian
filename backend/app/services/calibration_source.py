"""Источник данных для калибровки (решение продукта, 24.09): удалённый прогноз —
в корзине или окончательно — продолжает считаться в калибровке, удалением track
record не «улучшить». Читатели калибровки (профиль, дашборд, лаба) берут строки отсюда, а не
напрямую из predictions.

Три слоя: живые прогнозы, прогнозы в корзине (deleted_at) — обе группы прямо из
predictions — и «остатки» окончательно удалённых (PredictionCalibrationResidue: только
уверенность/исход/видимость/теги, без содержания). Видимость — та же политика, что и у
самих прогнозов (entity_visibility_filter), у остатков те же колонки user_id/visibility/lab_id.

Отдельный счётчик «удалено до проверки» — прогнозы, удалённые в статусе «не проверен»:
они не влияют на баллы калибровки, но показываются рядом с ней (вариант В).

calibration_score() — формула (Брайер + сглаживание Бюльмана), раньше жила в
hypothesis_evidence.py и дублировалась вручную в users.py. Раньше баллы ЕЩЁ и копились в
таблице CalibrationStat (плюс без минуса — переоткрытие прогноза или смена его видимости/лабы
не могли откатить старый вклад; на проде это давало 35 в счётчике при 21 реально закрытом
прогнозе, 29.09). Теперь copilка не пишется вообще — get_calibration_multiplier считает
на лету из этих же rows_for_* при каждом вызове (единственный вызывающий —
process_prediction_close, не горячий путь, лишний SELECT не проблема)."""
from app.core.prediction_status import OPEN_PREDICTION_STATUS
import math

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.lab_access import entity_visibility_filter
from app.models.entities import Prediction, PredictionCalibrationResidue as Residue

UNVERIFIED = OPEN_PREDICTION_STATUS

# Константа Бюльмана (credibility theory): после ~CREDIBILITY_K закрытых прогнозов в разрезе
# доверяем эмпирической калибровке наполовину. При 0 прогнозов calibration_score вернёт None —
# вызывающий сам решает нейтральное значение для своего контекста (multiplier: 1.0, сводка для
# профиля/лабы: скрыть блок, а не показывать обманчивый нейтральный балл).
CREDIBILITY_K = 8.0


def brier_component(confidence: int | None, status: str) -> float:
    p = (confidence if confidence is not None else 50) / 100.0
    actual = {"подтвердился": 1.0, "частично подтвердился": 0.5, "не подтвердился": 0.0}.get(status, 0.5)
    return (actual - p) ** 2


def calibration_score(rows: list[tuple], *, baseline: float) -> dict | None:
    """Сглаженный по Бюльману балл калибровки (0..1) по сырым (confidence, status) строкам —
    единая формула для множителя (hypothesis_evidence.get_calibration_multiplier), сводки
    профиля (users.py) и лидерборда лабы (labs.py); раньше эти три места считали одно и то же
    тремя слегка разными кусками кода. baseline — к чему тянет формула при малом n (0 прогнозов
    → нейтральные 1.0 для множителя; средний балл 0.5 для отображаемой сводки, где "нет данных"
    и "нейтрально откалиброван" должны выглядеть по-разному — вызывающий решает, показывать
    результат или нет, а не сама формула). z ("confidence" в терминах Бюльмана, не путать с
    confidence прогноза) — доля доверия эмпирике, растёт от 0 к 1 по мере роста n."""
    n = len(rows)
    if n == 0:
        return None
    brier_mean = sum(brier_component(c, s) for c, s in rows) / n
    empirical = 1.0 - brier_mean
    z = n / (n + CREDIBILITY_K)
    return {"score": z * empirical + (1 - z) * baseline, "n_closed": n, "z": z}


async def calibration_rows(db: AsyncSession, uid: int, viewer_id: int | None, *,
                            requested: set[str] | None = None, lab_id: int | None = None,
                            unresolved=frozenset({UNVERIFIED})) -> list[tuple]:
    """(confidence, status) прогнозов с уверенностью и исходом — живые + корзина + остатки."""
    rows: list[tuple] = []
    for model in (Prediction, Residue):
        vis = entity_visibility_filter(model, viewer_id, requested=requested, lab_id=lab_id, include_deleted=True)
        q = select(model.confidence, model.status).where(
            model.user_id == uid, vis,
            model.confidence.isnot(None), model.status.notin_(list(unresolved)),
        )
        rows += [(c, s) for c, s in (await db.execute(q)).all()]
    return rows


async def rows_for_personal(db: AsyncSession, user_id: int) -> list[tuple]:
    """Закрытые прогнозы владельца с visibility='private' — scope 'personal' в derive_scope."""
    return await calibration_rows(db, user_id, viewer_id=user_id, requested={"private"})


async def rows_for_public(db: AsyncSession, user_id: int) -> list[tuple]:
    """Закрытые прогнозы владельца с visibility='public' — scope 'public' в derive_scope.
    Личный публичный track record, не общесайтовый агрегат: у каждого пользователя свой."""
    return await calibration_rows(db, user_id, viewer_id=user_id, requested={"public"})


async def rows_for_lab_by_user(db: AsyncSession, lab_id: int) -> dict[int, list[tuple]]:
    """user_id -> [(confidence, status), ...] — прогнозы ВСЕХ участников, привязанные к этой
    лабе (lab_id, НЕ visibility=='lab'), живые + корзина + остатки.

    visibility='lab' и привязка к лабе — не одно и то же: visibility_from_lab (lab_access.py)
    делает сущности ПУБЛИЧНОЙ лабы visibility='public', а не 'lab' — 'lab' бывает только у
    закрытых лаб. Лидерборд калибровки (api/v1/labs.py get_lab_calibration) должен показывать
    ЛЮБОЙ прогноз, привязанный к лабе, независимо от того, публичная она или закрытая — иначе
    он молчал бы для каждой публичной лабы вообще всегда, что и обнаружилось на живых данных
    02.10 (5 закрытых прогнозов в публичной лабе, лидерборд пуст). Это ДРУГОЙ критерий, чем у
    derive_scope/rows_for_lab ниже (те считают множитель калибровки гипотезы по scope 'lab' —
    там как раз важно visibility=='lab' буквально, это сознательно не трогаем).

    Один проход по данным (2 запроса: Prediction, Residue) независимо от числа участников
    лабы — то, ради чего эта функция вообще существует отдельно от calibration_rows (та берёт
    ровно одного uid за раз, N участников означало бы N запросов)."""
    # Та же политика калибровки, что у calibration_rows выше (include_deleted-эквивалент
    # вручную, не через entity_visibility_filter — та рассчитана на одного viewer'а, здесь
    # нужны прогнозы ВСЕХ участников лабы разом): удалением track record не «улучшить».
    by_user: dict[int, list[tuple]] = {}
    for model in (Prediction, Residue):
        # deleted_at умышленно НЕ фильтруется — см. include_deleted-комментарий выше.
        q = select(model.user_id, model.confidence, model.status).where(
            model.lab_id == lab_id,
            model.confidence.isnot(None), model.status != UNVERIFIED,
        )
        for uid, c, s in (await db.execute(q)).all():
            by_user.setdefault(uid, []).append((c, s))
    return by_user


async def rows_for_lab(db: AsyncSession, lab_id: int) -> list[tuple]:
    """Все закрытые прогнозы лабы одним списком (без разбивки по участнику) — scope 'lab'."""
    by_user = await rows_for_lab_by_user(db, lab_id)
    return [row for rows in by_user.values() for row in rows]


async def calibration_status_counts(db: AsyncSession, uid: int) -> dict[str, int]:
    """status -> число прогнозов владельца (без онбординговых): живые + корзина + остатки."""
    counts: dict[str, int] = {}
    for model in (Prediction, Residue):
        q = (select(model.status, func.count())
             .where(model.user_id == uid, model.is_onboarding == False)  # noqa: E712
             .group_by(model.status))
        for status, n in (await db.execute(q)).all():
            counts[status] = counts.get(status, 0) + n
    return counts


async def deleted_unverified_count(db: AsyncSession, uid: int, viewer_id: int | None, *,
                                    requested: set[str] | None = None, lab_id: int | None = None) -> int:
    """Сколько прогнозов удалено до проверки (в корзине или окончательно), среди видимых viewer'у."""
    total = 0
    for model in (Prediction, Residue):
        vis = entity_visibility_filter(model, viewer_id, requested=requested, lab_id=lab_id, include_deleted=True)
        conds = [model.user_id == uid, vis, model.status == UNVERIFIED,
                 model.is_onboarding == False]  # noqa: E712
        if model is Prediction:
            conds.append(model.deleted_at.is_not(None))
        total += await db.scalar(select(func.count()).select_from(model).where(*conds)) or 0
    return total


MULTIPLIER_FLOOR = 0.5


def skill_multiplier(rows: list[tuple]) -> float:
    """Множитель вклада закрытого прогноза в сигнал гипотезы, 0.5..1.0 (профиль и лидерборд лабы считают
    по-прежнему calibration_score).

    Мера умения, а не близости к исходу: Брайер сравнивается с «ленивым», который на всё ставит одну и ту же
    вероятность — долю сбывшегося у самого автора. skill = 1 - Брайер/Брайер_ленивого, в пределах 0..1.
    Если исходы одинаковы (ленивый идеален), превзойти его нельзя: skill = 0. Серия «солнце взойдёт»
    преимущества не даёт. Результат 0.5 + 0.5 * skill. Доверие к мере z растёт с числом РЕДКИХ исходов (меньшинства), а не с числом
    прогнозов: пока нет ни промаха, ни успеха, меру измерить нельзя, и множитель нейтральный 1.0, как у новичка."""
    n = len(rows)
    if n == 0:
        return 1.0
    actual = [{"подтвердился": 1.0, "частично подтвердился": 0.5, "не подтвердился": 0.0}.get(s, 0.5) for _c, s in rows]
    base = sum(actual) / n
    lazy = sum((a - base) ** 2 for a in actual) / n
    brier = sum(brier_component(c, s) for c, s in rows) / n
    skill = 0.0 if lazy < 1e-9 else max(0.0, min(1.0, 1.0 - brier / lazy))
    minority = min(sum(actual), sum(1.0 - a for a in actual))
    z = minority / (minority + CREDIBILITY_K)
    return z * (MULTIPLIER_FLOOR + (1.0 - MULTIPLIER_FLOOR) * skill) + (1.0 - z) * 1.0
