import math
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, func
from app.core.prediction_status import CLOSED_PREDICTION_STATUSES
from app.models.entities import Hypothesis, Observation, Prediction, Link, MaturitySuggestion, Tag, EntityTag, PredictionCalibrationResidue
from app.services.calibration_source import (
    calibration_score, skill_multiplier, rows_for_personal, rows_for_public, rows_for_lab,
    brier_component, CREDIBILITY_K,  # реэкспорт — так продолжают работать существующие
    # `from app.services.hypothesis_evidence import brier_component, CREDIBILITY_K`
    # (tests/test_hypothesis_evidence.py); сама формула теперь в calibration_source.py.
)

# Минимум закрытых прогнозов в теге, прежде чем показывать личную калибровку —
# на 1-2 примерах статистика шумная и может ввести в заблуждение сильнее,
# чем помочь (тот же принцип, что и у порога cold-start в evidence_diversity).
MIN_TAG_CALIBRATION_N = 5

# CREDIBILITY_K и формула калибровки переехали в calibration_source.py вместе с
# get_calibration_multiplier — реэкспортируются импортом выше.

# Базовые пороги raw_signal для перехода на уровень зрелости [0..4] при risk=0.
# Масштабируются risk_multiplier — чем рискованнее гипотеза, тем больше
# доказательств нужно для того же перехода.
BASE_THRESHOLDS = [0.0, 2.0, 5.0, 10.0, 18.0]

# Слабый вес наблюдений относительно закрытых прогнозов — наблюдения дают
# более мягкий, непрерывный сигнал, а не разовое дискретное подтверждение.
OBSERVATION_WEIGHT = 0.3

# Шкала значимости наблюдения идет от 0 до IMPORTANCE_MAX (lib/scales.ts, «Значимость»):
# вклад наблюдения = знак * значимость / IMPORTANCE_MAX * OBSERVATION_WEIGHT.
IMPORTANCE_MAX = 5.0

# Прогноз без указанной уверенности считается «50 на 50». В расчете уверенность зажата
# в [CONFIDENCE_FLOOR, CONFIDENCE_CEIL], чтобы логарифм не уходил в бесконечность.
DEFAULT_CONFIDENCE = 50
CONFIDENCE_FLOOR = 0.01
CONFIDENCE_CEIL = 0.99

# Частично подтвердившийся прогноз дает долю PARTIAL_SHARE вклада подтвердившегося (штрафа не бывает).
PARTIAL_SHARE = 0.5

# Риск гипотезы идет по шкале 0..RISK_SCALE (lib/scales.ts, «Риск»): множитель порогов = 1 + риск / RISK_SCALE.
RISK_SCALE = 10.0


def derive_scope(visibility: str, lab_id: int | None, user_id: int) -> tuple[str, str]:
    """Личное / публичное / лабораторное — разрез, в котором считается калибровка."""
    if visibility == "lab" and lab_id:
        return "lab", str(lab_id)
    if visibility == "public":
        return "public", str(user_id)
    return "personal", str(user_id)


def prediction_contribution(confidence: int | None, status: str) -> float:
    """Surprisal-вес одного закрытого прогноза, без учёта калибровки.
    Подтверждённый уверенный прогноз — слабое доказательство (ожидаемо).
    Опровергнутый уверенный прогноз — сильный штраф (редкое, дорогое событие)."""
    p = (confidence if confidence is not None else DEFAULT_CONFIDENCE) / 100.0
    p = min(max(p, CONFIDENCE_FLOOR), CONFIDENCE_CEIL)
    if status == "подтвердился":
        return -math.log2(p)
    if status == "не подтвердился":
        return math.log2(1 - p)  # отрицательное число — штраф
    if status == "частично подтвердился":
        return PARTIAL_SHARE * (-math.log2(p))
    return 0.0


def closed_prediction_contribution(confidence: int | None, status: str, multiplier: float,
                                   confirms_if_true: bool) -> float:
    """Вклад закрытого прогноза в сигнал гипотезы: неожиданность исхода, умноженная на множитель навыка.
    Стресс-тест («если сбудется, гипотеза неверна») значит для гипотезы обратное, поэтому знак меняется;
    калибровка (Брайер) смотрит только на «сбылось или нет» и от флага не зависит."""
    contribution = prediction_contribution(confidence, status) * multiplier
    return contribution if confirms_if_true else -contribution


async def get_calibration_multiplier(db: AsyncSession, scope_type: str, scope_key: str) -> float:
    """Множитель калибровки для scope, посчитанный на лету из сырых закрытых прогнозов
    (services/calibration_source.py), не из копилки — копилки (CalibrationStat) больше нет,
    она только прибавляла и не умела откатывать вклад при переоткрытии/смене видимости.
    Единственный вызывающий — process_prediction_close, не горячий путь."""
    if scope_type == "personal":
        rows = await rows_for_personal(db, int(scope_key))
    elif scope_type == "public":
        rows = await rows_for_public(db, int(scope_key))
    elif scope_type == "lab":
        rows = await rows_for_lab(db, int(scope_key))
    else:
        rows = []
    return skill_multiplier(rows)


def risk_multiplier(risk: int) -> float:
    return 1.0 + (risk or 0) / RISK_SCALE


def link_signs(links) -> dict[int, int]:
    """Знак каждого наблюдения по типам связей с гипотезой: «подтверждает» +1, «опровергает» -1.
    Нейтральные связи в результат не попадают. links: объекты с from_type/from_id/to_type/to_id/link_type.
    Если у наблюдения несколько связей, побеждает последняя."""
    signs: dict[int, int] = {}
    for r in links:
        obs_id = r.from_id if r.from_type == "observation" else r.to_id
        if r.link_type == "подтверждает":
            signs[obs_id] = 1
        elif r.link_type == "опровергает":
            signs[obs_id] = -1
    return signs


def signal_from_evidence(evidence, exclude=frozenset()) -> float:
    """Чистый расчёт сигнала наблюдений. evidence: [(obs_id, знак, важность)]; exclude: id наблюдений,
    которые считаем «неверными» (режим «а что, если»). Боевой расчёт зовёт это без exclude."""
    return sum(sign * (imp or 0) / IMPORTANCE_MAX for oid, sign, imp in evidence if oid not in exclude) * OBSERVATION_WEIGHT


async def observation_evidence(db: AsyncSession, user_id: int, hypothesis_id: int, memo: dict | None = None) -> list[tuple[int, int, int]]:
    """Живые наблюдения, влияющие на гипотезу (см. _observation_evidence_query). memo: общая память ОДНОГО запроса,
    повторный вызов с теми же аргументами берёт готовый ответ; без memo поведение прежнее."""
    if memo is None:
        return await _observation_evidence_query(db, user_id, hypothesis_id)
    key = ("obs_ev", user_id, hypothesis_id)
    if key not in memo:
        memo[key] = await _observation_evidence_query(db, user_id, hypothesis_id)
    return list(memo[key])


async def _observation_evidence_query(db: AsyncSession, user_id: int, hypothesis_id: int) -> list[tuple[int, int, int]]:
    """Живые наблюдения, влияющие на гипотезу: [(obs_id, знак, важность)]. Нейтральные связи
    ("related") в сигнал не идут: иначе обычная навигационная связь молча сдвигала бы зрелость."""
    rows = (await db.execute(
        select(Link).where(
            Link.user_id == user_id,
            (
                (Link.from_type == "observation") & (Link.to_type == "hypothesis") & (Link.to_id == hypothesis_id)
            ) | (
                (Link.to_type == "observation") & (Link.from_type == "hypothesis") & (Link.from_id == hypothesis_id)
            ),
        )
    )).scalars().all()
    signs = link_signs(rows)
    if not signs:
        return []
    obs = (await db.execute(
        select(Observation).where(Observation.id.in_(signs.keys()), Observation.deleted_at.is_(None))
    )).scalars().all()
    return [(o.id, signs[o.id], o.importance or 0) for o in obs]


async def observation_signal(db: AsyncSession, user_id: int, hypothesis_id: int, memo: dict | None = None) -> float:
    """Сумма важности связанных наблюдений со знаком: подтверждающие прибавляют, опровергающие
    вычитают (симметрично с prediction_contribution)."""
    return signal_from_evidence(await observation_evidence(db, user_id, hypothesis_id, memo))


def scaled_thresholds(risk: int) -> list[float]:
    """Пороги сигнала для уровней зрелости при данном риске: базовые, умноженные на risk_multiplier."""
    mult = risk_multiplier(risk)
    return [t * mult for t in BASE_THRESHOLDS]


def level_from_signal(raw_signal: float, risk: int) -> int:
    level = 0
    for i, threshold in enumerate(scaled_thresholds(risk)):
        if raw_signal >= threshold:
            level = i
    return level


async def foreign_lab_signal(db: AsyncSession, hyp: Hypothesis, memo: dict | None = None) -> float:
    """ЧУЖОЙ вклад в сигнал лаборатории: замороженные вклады участников, кроме владельца гипотезы
    (его вклады уже в hyp.evidence_signal, второй раз не считаем). Те же правила, что у lab_signal:
    только пока гипотеза в той же лаборатории, прогнозы из корзины и «сухие остатки» остаются в сумме."""
    if hyp.lab_id is None:
        return 0.0
    # deleted_at умышленно НЕ фильтруется: прогноз из корзины остаётся в сигнале (как в lab_signal)
    live = await db.scalar(select(func.coalesce(func.sum(Prediction.lab_signal_contribution), 0.0)).where(
        Prediction.hypothesis_id == hyp.id, Prediction.lab_id == hyp.lab_id, Prediction.user_id != hyp.user_id))
    purged = await db.scalar(select(func.coalesce(func.sum(PredictionCalibrationResidue.lab_signal_contribution), 0.0)).where(
        PredictionCalibrationResidue.hypothesis_id == hyp.id, PredictionCalibrationResidue.lab_id == hyp.lab_id,
        PredictionCalibrationResidue.user_id != hyp.user_id))
    return float(live or 0.0) + float(purged or 0.0) + await foreign_observation_signal(db, hyp, memo=memo)


async def _lab_voters(db: AsyncSession, lab_id: int, memo: dict | None) -> set[int]:
    """Состав лаборатории: участники и владелец. Кэшируется ДО исключения владельца гипотезы (у гипотез одной
    лаборатории владельцы разные), исключение делает зовущий."""
    key = ("voters", lab_id)
    if memo is not None and key in memo:
        return set(memo[key])
    from app.models.social import Lab, LabMember
    voters = set((await db.execute(select(LabMember.user_id).where(LabMember.lab_id == lab_id))).scalars().all())
    lab = await db.get(Lab, lab_id)
    if lab is not None:
        voters.add(lab.owner_id)
    if memo is not None:
        memo[key] = frozenset(voters)
    return voters


async def foreign_observation_signal(db: AsyncSession, hyp: Hypothesis, details: dict | None = None, *, memo: dict | None = None) -> float:
    """Наблюдения участников в сигнале гипотезы (правила: _foreign_observation_compute). memo: общая память одного
    запроса; в ней лежат И число, И details (голоса), даже если первый вызов был без details: иначе второй вызов с
    details потерял бы голоса. Без memo поведение прежнее."""
    if memo is None:
        return await _foreign_observation_compute(db, hyp, details, None)
    key = ("foreign_obs", hyp.id)
    if key not in memo:
        d: dict = dict()
        memo[key] = (await _foreign_observation_compute(db, hyp, d, memo), d)
    value, cached = memo[key]
    if details is not None:
        for oid, item in cached.items():
            details[oid] = dict(item)
    return value


async def _foreign_observation_compute(db: AsyncSession, hyp: Hypothesis, details: dict | None, memo: dict | None) -> float:
    """Наблюдения участников лаборатории в сигнале гипотезы (правило V3): наблюдение считается один раз,
    голоса участников (по одному на человека) усредняются. Голосует тот, кто сейчас в лаборатории, не владелец
    гипотезы; наблюдение живое и с тем же lab_id; если владелец сам поставил знаковую связь, наблюдение
    уже в его «своём» сигнале и здесь пропускается. Нейтральные связи не голосуют."""
    if hyp.lab_id is None:
        return 0.0
    voters = await _lab_voters(db, hyp.lab_id, memo)
    voters.discard(hyp.user_id)
    if not voters:
        return 0.0
    links = (await db.execute(
        select(Link).where(
            Link.user_id.in_(voters),
            (
                (Link.from_type == "observation") & (Link.to_type == "hypothesis") & (Link.to_id == hyp.id)
            ) | (
                (Link.to_type == "observation") & (Link.from_type == "hypothesis") & (Link.from_id == hyp.id)
            ),
        ).order_by(Link.id)
    )).scalars().all()
    votes: dict[int, dict[int, int]] = {}  # obs_id -> {голосующий: знак}, у одного человека побеждает последняя связь
    for r in links:
        sign = 1 if r.link_type == "подтверждает" else -1 if r.link_type == "опровергает" else 0
        if sign:
            oid = r.from_id if r.from_type == "observation" else r.to_id
            votes.setdefault(oid, {})[r.user_id] = sign
    if not votes:
        return 0.0
    owner_counted = {oid for oid, _, _ in await observation_evidence(db, hyp.user_id, hyp.id, memo)}
    obs = (await db.execute(
        select(Observation).where(Observation.id.in_(votes.keys()), Observation.deleted_at.is_(None),
                                  Observation.lab_id == hyp.lab_id)
    )).scalars().all()
    evidence = [(o.id, sum(votes[o.id].values()) / len(votes[o.id]), o.importance or 0)
                for o in obs if o.id not in owner_counted]
    if details is not None:  # для меток эффекта: вклад каждого наблюдения и сводка голосов, из тех же данных
        for oid, mean, imp in evidence:
            details[oid] = {"value": signal_from_evidence([(oid, mean, imp)]), "n": len(votes[oid]), "mean": mean}
    return signal_from_evidence(evidence)


async def recompute_for_observation(db: AsyncSession, observation_id: int) -> None:
    """Наблюдение изменилось (важность, лаборатория, корзина, возврат): пересчитать предложение зрелости у всех
    живых гипотез, с которыми оно связано (связи любого автора). Без commit: зовущий коммитит сам."""
    from app.services.evidence_diversity import invalidate_evidence_diversity
    links = (await db.execute(select(Link).where(
        ((Link.from_type == "observation") & (Link.from_id == observation_id) & (Link.to_type == "hypothesis"))
        | ((Link.to_type == "observation") & (Link.to_id == observation_id) & (Link.from_type == "hypothesis"))
    ))).scalars().all()
    hyp_ids = {l.to_id if l.from_type == "observation" else l.from_id for l in links}
    if not hyp_ids:
        return
    hyps = (await db.execute(select(Hypothesis).where(Hypothesis.id.in_(hyp_ids), Hypothesis.deleted_at.is_(None)))).scalars().all()
    for hyp in hyps:
        await recompute_suggestion(db, hyp)
        invalidate_evidence_diversity(hyp)


async def lab_total_signal(db: AsyncSession, hyp: Hypothesis, memo: dict | None = None) -> float:
    """Полный вклад лаборатории для показа: прогнозы лаборатории (включая владельца) + наблюдения владельца с тем же
    lab_id (личные в лабораторию не идут) + усреднённые голоса участников. Двойного счёта нет: наблюдение, которое
    владелец связал сам, считается один раз (foreign_observation_signal такие пропускает)."""
    if hyp.lab_id is None:
        return 0.0
    owner_ev = await observation_evidence(db, hyp.user_id, hyp.id, memo)
    in_lab: set[int] = set()
    if owner_ev:
        in_lab = set((await db.execute(select(Observation.id).where(
            Observation.id.in_([oid for oid, _, _ in owner_ev]), Observation.lab_id == hyp.lab_id,
            Observation.deleted_at.is_(None)))).scalars().all())
    owner_obs = signal_from_evidence([e for e in owner_ev if e[0] in in_lab])
    return (await lab_signal(db, hyp.id, hyp.lab_id if memo is not None else None) + owner_obs
            + await foreign_observation_signal(db, hyp, memo=memo))


async def recompute_lab_hypotheses(db: AsyncSession, lab_id: int) -> None:
    """Состав лаборатории изменился (выход или исключение участника): голоса по наблюдениям считаются «на лету»
    по текущему членству, поэтому предложения зрелости у всех живых гипотез лаборатории устарели. Без commit."""
    hyps = (await db.execute(select(Hypothesis).where(
        Hypothesis.lab_id == lab_id, Hypothesis.deleted_at.is_(None)))).scalars().all()
    for hyp in hyps:
        await recompute_suggestion(db, hyp)


async def maturity_signal(db: AsyncSession, hyp: Hypothesis, memo: dict | None = None) -> tuple[float, float, float, float]:
    """Единая формула сигнала для предложения зрелости: (прогнозы владельца, наблюдения владельца,
    чужой вклад лаборатории, сумма). Её зовут и recompute_suggestion, и баннер пакета (link_batch):
    две копии формулы разошлись бы."""
    obs = await observation_signal(db, hyp.user_id, hyp.id, memo)
    lab = await foreign_lab_signal(db, hyp, memo)
    return hyp.evidence_signal, obs, lab, hyp.evidence_signal + obs + lab


async def recompute_suggestion(db: AsyncSession, hyp: Hypothesis):
    # пересчёты одной гипотезы идут по очереди: иначе два параллельных создали бы по pending и второй упал бы на индексе
    await db.execute(select(Hypothesis.id).where(Hypothesis.id == hyp.id).with_for_update())
    pred_part, obs_signal, lab_part, total_signal = await maturity_signal(db, hyp)
    suggested = level_from_signal(total_signal, hyp.risk)

    existing = (await db.execute(
        select(MaturitySuggestion).where(MaturitySuggestion.hypothesis_id == hyp.id, MaturitySuggestion.status == "pending")
    )).scalar_one_or_none()

    if suggested == hyp.maturity:
        # Сигнал вернулся к текущему уровню — снимаем неактуальное предложение, если было
        if existing:
            existing.status = "dismissed"
        return

    reason = (
        f"Накопленный сигнал доказательств: {total_signal:.2f} "
        f"(прогнозы: {hyp.evidence_signal:.2f}, наблюдения: {obs_signal:.2f}, лаборатория: {lab_part:.2f}), "
        f"риск гипотезы: {hyp.risk} → предложенный уровень {suggested} (сейчас {hyp.maturity})."
    )

    if existing:
        existing.raw_signal = total_signal
        existing.current_level = hyp.maturity
        existing.suggested_level = suggested
        existing.reason = reason
        existing.pred_signal, existing.obs_signal, existing.lab_signal = pred_part, obs_signal, lab_part
    else:
        db.add(MaturitySuggestion(
            hypothesis_id=hyp.id, raw_signal=total_signal,
            current_level=hyp.maturity, suggested_level=suggested, reason=reason, status="pending",
            pred_signal=pred_part, obs_signal=obs_signal, lab_signal=lab_part,
        ))


async def _lab_contribution(db: AsyncSession, pred, user_id: int, contribution: float) -> float:
    """Вклад в сигнал лаборатории: гипотеза и прогноз привязаны к ОДНОЙ лаборатории, автор прогноза в ней состоит
    (участник или владелец). Смотрим на lab_id, а не на visibility: у публичных лабораторий visibility=public."""
    if not pred.hypothesis_id or not pred.lab_id:
        return 0.0
    hyp = await db.get(Hypothesis, pred.hypothesis_id)
    if hyp is None or hyp.lab_id != pred.lab_id:
        return 0.0
    from app.models.social import Lab, LabMember
    member = await db.scalar(select(LabMember.user_id).where(LabMember.lab_id == pred.lab_id, LabMember.user_id == user_id))
    if member is None:
        lab = await db.get(Lab, pred.lab_id)
        if lab is None or lab.owner_id != user_id:
            return 0.0
    return contribution


async def lab_signal(db: AsyncSession, hypothesis_id: int, hyp_lab_id: int | None = None) -> float:
    """Сигнал лаборатории гипотезы: сумма замороженных вкладов закрытых прогнозов участников (NULL — не в счёт).
    deleted_at умышленно НЕ фильтруется: прогноз из корзины остаётся в сигнале, как и в калибровке
    (удалением track record не улучшить)."""
    # вклады считаются только пока гипотеза в той же лаборатории, где они были внесены: вынесли из лабы — 0,
    # вернули в ту же — снова считаются (строки не удаляются), перенесли в другую — вклады старой не идут
    if hyp_lab_id is None:  # сводка лаборатории отдаёт lab_id сама (объект гипотезы уже есть): лишний SELECT не нужен
        hyp_lab_id = await db.scalar(select(Hypothesis.lab_id).where(Hypothesis.id == hypothesis_id))
    if hyp_lab_id is None:
        return 0.0
    total = await db.scalar(select(func.coalesce(func.sum(Prediction.lab_signal_contribution), 0.0)).where(
        Prediction.hypothesis_id == hypothesis_id, Prediction.lab_id == hyp_lab_id))
    # окончательно удалённые прогнозы: строки нет, вклад живёт в «сухом остатке» (без двойного счёта: остаток
    # появляется только в момент физического удаления прогноза)
    purged = await db.scalar(select(func.coalesce(func.sum(PredictionCalibrationResidue.lab_signal_contribution), 0.0)).where(
        PredictionCalibrationResidue.hypothesis_id == hypothesis_id, PredictionCalibrationResidue.lab_id == hyp_lab_id))
    return float(total or 0.0) + float(purged or 0.0)


async def process_prediction_close(db: AsyncSession, pred, user_id: int):
    """Вызывается из close_pred: обновляет бегущий сигнал гипотезы, готовит предложение.
    Калибровка нигде не «пишется» (см. get_calibration_multiplier) — раньше здесь же писалась
    копилка per-tag ("tag" scope) и per-участник-лабы ("lab_member") через update_calibration,
    но обе никем не читались: get_tag_calibration_summary всегда считала на лету из сырых
    прогнозов, а "lab_member" не читался вообще нигде. Мёртвый код убран — на закрытие прогноза
    стало на 2 записи и 1 запрос (tag_names) меньше."""
    if pred.status not in CLOSED_PREDICTION_STATUSES:
        return

    scope_type, scope_key = derive_scope(pred.visibility, pred.lab_id, user_id)
    multiplier = await get_calibration_multiplier(db, scope_type, scope_key)
    contribution = closed_prediction_contribution(
        pred.confidence, pred.status, multiplier, pred.confirms_hypothesis_if_true)

    pred.signal_contribution = 0.0  # нет гипотезы — в сигнал ничего не внесено (NULL бывает только у старых закрытых)
    pred.lab_signal_contribution = await _lab_contribution(db, pred, user_id, contribution)
    if pred.hypothesis_id:
        # с блокировкой и свежими данными: два одновременных закрытия не затирают evidence_signal друг друга
        hyp = (await db.execute(select(Hypothesis).where(Hypothesis.id == pred.hypothesis_id)
                                .with_for_update().execution_options(populate_existing=True))).scalar_one_or_none()
        # вклад идёт в сигнал только своей гипотезы: к чужой публичной можно привязаться (can_link), но двигать её сигнал нельзя
        if hyp and hyp.user_id == user_id:
            hyp.evidence_signal += contribution
            pred.signal_contribution = contribution
            await recompute_suggestion(db, hyp)
        elif hyp and pred.lab_signal_contribution:
            # закрыл участник лаборатории: личный сигнал владельца не двигается, но предложение зрелости меняется
            await recompute_suggestion(db, hyp)

async def get_tag_calibration_summary(db: AsyncSession, user_id: int, tag_name: str) -> dict | None:
    """Личный 'базовый уровень' по тегу — не абстрактный Brier-агрегат
    (тот в CalibrationStat), а дружелюбная сводка: сколько прогнозов в этой
    теме закрыто, сколько подтвердилось, и есть ли системный перекос между
    заявленной уверенностью и фактическим исходом. Не диагноз, не совет —
    просто зеркало собственной истории (см. обсуждение патернализма в чате).

    Возвращает None, если данных меньше MIN_TAG_CALIBRATION_N — на 1-2
    примерах статистика шумная и может ввести в заблуждение сильнее, чем
    помочь."""
    rows = (await db.execute(
        select(Prediction.confidence, Prediction.status)
        .join(Hypothesis, Hypothesis.id == Prediction.hypothesis_id)
        .join(EntityTag, (EntityTag.entity_type == "hypothesis") & (EntityTag.entity_id == Hypothesis.id))
        .join(Tag, Tag.id == EntityTag.tag_id)
        .where(
            Tag.user_id == user_id, Tag.name == tag_name,
            # deleted_at умышленно НЕ фильтруется: прогнозы из корзины остаются в калибровке
            # (решение продукта: удалением track record не «улучшить»)
            Prediction.user_id == user_id,
            Prediction.status.in_(CLOSED_PREDICTION_STATUSES),
        )
    )).all()

    # окончательно удалённые прогнозы: остаток хранит имена тегов гипотезы на момент удаления
    residue_rows = (await db.execute(
        select(PredictionCalibrationResidue.confidence, PredictionCalibrationResidue.status).where(
            PredictionCalibrationResidue.user_id == user_id,
            PredictionCalibrationResidue.tag_names.contains([tag_name]),
            PredictionCalibrationResidue.status.in_(CLOSED_PREDICTION_STATUSES),
        )
    )).all()
    rows = list(rows) + list(residue_rows)

    n_closed = len(rows)
    if n_closed < MIN_TAG_CALIBRATION_N:
        return None

    outcome_weight = {"подтвердился": 1.0, "частично подтвердился": 0.5, "не подтвердился": 0.0}
    confidences = [(c if c is not None else 50) / 100.0 for c, _ in rows]
    outcomes = [outcome_weight[status] for _, status in rows]

    avg_confidence = sum(confidences) / n_closed
    actual_rate = sum(outcomes) / n_closed
    confirmed_count = sum(1 for _, status in rows if status == "подтвердился")

    diff = avg_confidence - actual_rate
    bias = "over" if diff > 0.15 else ("under" if diff < -0.15 else "calibrated")

    return {
        "tag": tag_name,
        "n_closed": n_closed,
        "confirmed_count": confirmed_count,
        "avg_confidence_pct": round(avg_confidence * 100),
        "actual_rate_pct": round(actual_rate * 100),
        "bias": bias,
    }


def what_if(evidence_signal: float, risk: int, evidence, exclude=frozenset()) -> dict:
    """Режим «а что, если эти наблюдения неверны»: как изменится уровень зрелости гипотезы.
    Сравнение идёт с уровнем по полному сигналу, а не с hyp.maturity. Прогнозы не пересчитываются:
    их вклад уже влит в evidence_signal. Чистая функция, БД не трогает."""
    total_before = evidence_signal + signal_from_evidence(evidence)
    total_after = evidence_signal + signal_from_evidence(evidence, exclude)
    before = level_from_signal(total_before, risk)
    after = level_from_signal(total_after, risk)
    if after > before:
        verdict = "strengthened"
    elif after == before:
        verdict = "held"
    elif before - after == 1:
        verdict = "weakened"
    else:
        verdict = "collapsed"
    return {"level_before": before, "level_after": after, "verdict": verdict,
            "signal_before": round(total_before, 3), "signal_after": round(total_after, 3),
            "affected": any(oid in exclude for oid, _, _ in evidence)}


def load_bearing(evidence_signal: float, risk: int, evidence) -> list[int]:
    """id наблюдений, без каждого из которых по отдельности уровень гипотезы падает."""
    return [oid for oid, _, _ in evidence
            if what_if(evidence_signal, risk, evidence, {oid})["level_after"]
            < what_if(evidence_signal, risk, evidence)["level_before"]]


async def observation_evidence_bulk(db: AsyncSession, hyps) -> dict[int, list[tuple[int, int, int]]]:
    """То же, что observation_evidence, сразу для многих гипотез: 2 запроса вместо 2 на каждую.
    Связи учитываются только владельца гипотезы (как в боевом расчёте). Ключ: id гипотезы."""
    owner = {h.id: h.user_id for h in hyps}
    if not owner:
        return {}
    ids = list(owner)
    rows = (await db.execute(select(Link).where(or_(
        and_(Link.from_type == "observation", Link.to_type == "hypothesis", Link.to_id.in_(ids)),
        and_(Link.to_type == "observation", Link.from_type == "hypothesis", Link.from_id.in_(ids)),
    )))).scalars().all()
    by_hyp: dict[int, list] = {hid: [] for hid in ids}
    for r in rows:
        hid = r.to_id if r.to_type == "hypothesis" else r.from_id
        if r.user_id == owner[hid]:
            by_hyp[hid].append(r)
    signs = {hid: link_signs(ls) for hid, ls in by_hyp.items()}
    obs_ids = {oid for sg in signs.values() for oid in sg}
    imp = {}
    if obs_ids:
        imp = {o.id: (o.importance or 0) for o in (await db.execute(
            select(Observation).where(Observation.id.in_(obs_ids), Observation.deleted_at.is_(None)))).scalars()}
    return {hid: [(oid, sg[oid], imp[oid]) for oid in sg if oid in imp] for hid, sg in signs.items()}


def what_if_delta(evidence, exclude=frozenset()) -> dict:
    """«А что, если» для чужой гипотезы: только сдвиг сигнала от видимых наблюдений. Уровень и полный сигнал
    не считаются: они зависят от скрытых данных автора (закрытые прогнозы, приватные наблюдения)."""
    delta = round(signal_from_evidence(evidence, exclude) - signal_from_evidence(evidence), 3)
    return {"affected": any(oid in exclude for oid, _, _ in evidence), "signal_delta": delta,
            "direction": "up" if delta > 0 else "down" if delta < 0 else "none"}
