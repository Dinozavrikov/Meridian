"""Описание модели зрелости и пробный расчет для страницы документации.

Единственный источник чисел и правил: hypothesis_evidence.py, calibration_source.py, evidence_diversity.py.
Здесь ничего не продублировано. Константы читаются оттуда, а расчет собран из тех же чистых функций,
которыми пользуется боевой код. Поменялась формула или число, поменялась и страница документации.
"""
import math

from app.services.calibration_source import CREDIBILITY_K, MULTIPLIER_FLOOR, skill_multiplier
from app.services.evidence_diversity import (
    CONFIRMING_MIN_COUNT, NARROW_BASE, REFUTING_MIN_COUNT, SOURCE_SIMILARITY_THRESHOLD,
)
from app.services.hypothesis_evidence import (
    BASE_THRESHOLDS, CONFIDENCE_CEIL, CONFIDENCE_FLOOR, DEFAULT_CONFIDENCE, IMPORTANCE_MAX,
    MIN_TAG_CALIBRATION_N, OBSERVATION_WEIGHT, PARTIAL_SHARE, RISK_SCALE, closed_prediction_contribution,
    level_from_signal, prediction_contribution, risk_multiplier, scaled_thresholds, signal_from_evidence,
)

# Члены формулы. Страница документации обязана описать каждый: фронтенд-тест падает, если описания нет.
FORMULA_TERMS = ("predictions", "observations", "lab", "skill", "risk")

# Ключи исходов в API -> значения статуса в базе. Тест следит, чтобы новый статус прогноза не прошел мимо.
OUTCOMES = {
    "confirmed": "подтвердился",
    "partial": "частично подтвердился",
    "refuted": "не подтвердился",
}

RISK_MAX = int(RISK_SCALE)  # шкала риска 0..RISK_SCALE
MAX_ITEMS = 30         # предел списков в пробном расчете: ручка открытая
MAX_HISTORY = 200
LAB_SIGNAL_LIMIT = 100.0
CONFIDENCE_SAMPLES = (50, 70, 90)   # строки таблицы «неожиданность исхода»


def describe_model() -> dict:
    top = len(BASE_THRESHOLDS) - 1
    risk_samples = sorted({0, RISK_MAX // 2, RISK_MAX})
    return {
        "terms": list(FORMULA_TERMS),
        "outcomes": list(OUTCOMES),
        "levels": {"min": 0, "max": top, "base_thresholds": list(BASE_THRESHOLDS)},
        "risk": {
            "min": 0, "max": RISK_MAX, "scale": RISK_SCALE,
            "table": [{"risk": r, "multiplier": risk_multiplier(r), "thresholds": scaled_thresholds(r)}
                      for r in risk_samples],
        },
        "observation": {
            "weight": OBSERVATION_WEIGHT,
            "importance_max": IMPORTANCE_MAX,
            # вклад самого значимого наблюдения: берется из боевой функции, а не выводится рукой
            "max_contribution": signal_from_evidence([(0, 1, int(IMPORTANCE_MAX))]),
        },
        "prediction": {
            "default_confidence": DEFAULT_CONFIDENCE,
            "confidence_floor_pct": round(CONFIDENCE_FLOOR * 100),
            "confidence_ceil_pct": round(CONFIDENCE_CEIL * 100),
            "partial_share": PARTIAL_SHARE,
            "examples": [
                {"confidence": c,
                 "confirmed": prediction_contribution(c, OUTCOMES["confirmed"]),
                 "partial": prediction_contribution(c, OUTCOMES["partial"]),
                 "refuted": prediction_contribution(c, OUTCOMES["refuted"])}
                for c in CONFIDENCE_SAMPLES
            ],
        },
        "skill": {"floor": MULTIPLIER_FLOOR, "neutral": skill_multiplier([]), "credibility_k": CREDIBILITY_K},
        "calibration": {"min_tag_n": MIN_TAG_CALIBRATION_N},
        "diversity": {
            "similarity_threshold": SOURCE_SIMILARITY_THRESHOLD,
            "confirming_min_count": CONFIRMING_MIN_COUNT,
            "refuting_min_count": REFUTING_MIN_COUNT,
            "narrow_base": NARROW_BASE,
        },
        "limits": {"max_items": MAX_ITEMS, "max_history": MAX_HISTORY, "lab_signal": LAB_SIGNAL_LIMIT},
    }


def _is_int(x) -> bool:
    return isinstance(x, int) and not isinstance(x, bool)


def _check(cond: bool, message: str) -> None:
    if not cond:
        raise ValueError(message)


def _validate(risk, predictions, observations, lab_signal, hits, misses, hist_conf) -> None:
    _check(_is_int(risk) and 0 <= risk <= RISK_MAX, "risk")
    _check(len(predictions) <= MAX_ITEMS, "predictions: слишком много")
    _check(len(observations) <= MAX_ITEMS, "observations: слишком много")
    for p in predictions:
        c = p.get("confidence")
        _check(c is None or (_is_int(c) and 0 <= c <= 100), "confidence")
        _check(p.get("outcome") in OUTCOMES, "outcome")
    for o in observations:
        _check(o.get("sign") in (1, -1), "sign")
        imp = o.get("importance")
        _check(imp is None or (_is_int(imp) and 0 <= imp <= IMPORTANCE_MAX), "importance")
    _check(isinstance(lab_signal, (int, float)) and math.isfinite(lab_signal)
           and abs(lab_signal) <= LAB_SIGNAL_LIMIT, "lab_signal")
    _check(_is_int(hits) and 0 <= hits <= MAX_HISTORY, "history_hits")
    _check(_is_int(misses) and 0 <= misses <= MAX_HISTORY, "history_misses")
    _check(_is_int(hist_conf) and 0 <= hist_conf <= 100, "history_confidence")


def simulate(*, risk: int, predictions: list[dict], observations: list[dict], lab_signal: float = 0.0,
             history_hits: int = 0, history_misses: int = 0,
             history_confidence: int = DEFAULT_CONFIDENCE) -> dict:
    """Пробный расчет зрелости: те же функции, что у боевого кода.

    predictions: [{confidence: int|None, outcome: ключ из OUTCOMES, confirms_if_true: bool (по умолчанию True)}]
    observations: [{sign: 1|-1, importance: int|None}]
    История (history_*) нужна только для множителя навыка; без нее множитель нейтральный, как у новичка.
    В настоящей системе множитель считается в момент закрытия каждого прогноза; здесь он один на все.
    """
    _validate(risk, predictions, observations, lab_signal, history_hits, history_misses, history_confidence)

    rows = ([(history_confidence, OUTCOMES["confirmed"])] * history_hits
            + [(history_confidence, OUTCOMES["refuted"])] * history_misses)
    multiplier = skill_multiplier(rows)

    pred_items = [closed_prediction_contribution(
        p.get("confidence"), OUTCOMES[p["outcome"]], multiplier, p.get("confirms_if_true", True))
        for p in predictions]
    obs_items = [signal_from_evidence([(0, o["sign"], o.get("importance"))]) for o in observations]

    pred_signal = sum(pred_items)
    obs_signal = signal_from_evidence([(i, o["sign"], o.get("importance")) for i, o in enumerate(observations)])
    total = pred_signal + obs_signal + float(lab_signal)

    thresholds = scaled_thresholds(risk)
    level = level_from_signal(total, risk)
    next_level = level + 1 if level + 1 < len(thresholds) else None
    return {
        "skill_multiplier": multiplier,
        "risk_multiplier": risk_multiplier(risk),
        "thresholds": thresholds,
        "predictions": [{"contribution": c} for c in pred_items],
        "observations": [{"contribution": c} for c in obs_items],
        "signal": {"predictions": pred_signal, "observations": obs_signal,
                   "lab": float(lab_signal), "total": total},
        "level": level,
        "next_level": next_level,
        "to_next": None if next_level is None else max(0.0, thresholds[next_level] - total),
    }
