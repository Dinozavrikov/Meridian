"""Модель зрелости для документации: числа берутся из боевого кода, расчет совпадает с формулой."""
import math

import pytest

from app.core.prediction_status import CLOSED_PREDICTION_STATUSES
from app.services import maturity_model as mm
from app.services.calibration_source import CREDIBILITY_K, MULTIPLIER_FLOOR
from app.services.hypothesis_evidence import (
    BASE_THRESHOLDS, OBSERVATION_WEIGHT, PARTIAL_SHARE, prediction_contribution,
)


def pred(conf, outcome="confirmed", stress=False):
    return {"confidence": conf, "outcome": outcome, "confirms_if_true": not stress}


def obs(sign, imp):
    return {"sign": sign, "importance": imp}


def run(**kw):
    args = dict(risk=0, predictions=[], observations=[])
    args.update(kw)
    return mm.simulate(**args)


def test_every_counting_status_has_an_outcome_key():
    # новый статус прогноза, который влияет на сигнал, обязан попасть в OUTCOMES, иначе калькулятор соврет
    for status in CLOSED_PREDICTION_STATUSES:
        if status not in mm.OUTCOMES.values():
            assert prediction_contribution(60, status) == 0.0, status
    assert set(mm.OUTCOMES.values()) <= set(CLOSED_PREDICTION_STATUSES)


def test_describe_reads_live_constants():
    d = mm.describe_model()
    assert d["levels"]["base_thresholds"] == list(BASE_THRESHOLDS)
    assert d["levels"]["max"] == len(BASE_THRESHOLDS) - 1
    assert d["observation"]["weight"] == OBSERVATION_WEIGHT
    # самое значимое наблюдение дает ровно вес наблюдения: 5/5 * 0.3
    assert d["observation"]["max_contribution"] == pytest.approx(OBSERVATION_WEIGHT)
    assert d["skill"]["floor"] == MULTIPLIER_FLOOR and d["skill"]["neutral"] == 1.0
    assert d["prediction"]["partial_share"] == PARTIAL_SHARE
    for row in d["risk"]["table"]:
        mult = 1 + row["risk"] / 10
        assert row["multiplier"] == pytest.approx(mult)
        assert row["thresholds"] == pytest.approx([t * mult for t in BASE_THRESHOLDS])
    ex = {e["confidence"]: e for e in d["prediction"]["examples"]}
    assert ex[50]["confirmed"] == pytest.approx(1.0)
    assert ex[90]["refuted"] == pytest.approx(math.log2(0.1))
    assert set(d["terms"]) == set(mm.FORMULA_TERMS)


def test_single_confirmed_prediction_is_surprisal():
    r = run(predictions=[pred(80)])
    assert r["signal"]["predictions"] == pytest.approx(-math.log2(0.8))
    assert r["level"] == 0


def test_levels_move_with_risk():
    seven = [pred(50)] * 7           # по 1.0 каждый
    r0 = run(risk=0, predictions=seven)
    assert r0["signal"]["total"] == pytest.approx(7.0)
    assert r0["level"] == 2          # пороги 0, 2, 5, 10, 18
    r10 = run(risk=10, predictions=seven)
    assert r10["level"] == 1         # пороги вдвое выше: 0, 4, 10, 20, 36


def test_refuted_confident_prediction_is_expensive():
    assert run(predictions=[pred(90, "refuted")])["signal"]["predictions"] == pytest.approx(math.log2(0.1))


def test_partial_is_half_of_confirmed_and_never_a_penalty():
    full = run(predictions=[pred(90)])["signal"]["predictions"]
    part = run(predictions=[pred(90, "partial")])["signal"]["predictions"]
    assert part == pytest.approx(PARTIAL_SHARE * full) and part > 0


def test_stress_test_inverts_sign():
    normal = run(predictions=[pred(70)])["signal"]["predictions"]
    stress = run(predictions=[pred(70, stress=True)])["signal"]["predictions"]
    assert stress == pytest.approx(-normal)


def test_missing_confidence_means_fifty_and_edges_are_clamped():
    assert run(predictions=[pred(None)])["signal"]["total"] == pytest.approx(run(predictions=[pred(50)])["signal"]["total"])
    assert run(predictions=[pred(100)])["signal"]["total"] == pytest.approx(-math.log2(0.99))
    assert run(predictions=[pred(0, "refuted")])["signal"]["total"] == pytest.approx(math.log2(0.99))


def test_observations_use_importance_and_sign():
    assert run(observations=[obs(1, 5)])["signal"]["observations"] == pytest.approx(OBSERVATION_WEIGHT)
    assert run(observations=[obs(-1, 5)])["signal"]["observations"] == pytest.approx(-OBSERVATION_WEIGHT)
    assert run(observations=[obs(1, 3)])["signal"]["observations"] == pytest.approx(0.6 * OBSERVATION_WEIGHT)
    assert run(observations=[obs(1, None)])["signal"]["observations"] == 0.0


def test_lab_signal_is_added_and_thresholds_are_inclusive():
    assert run(lab_signal=2.0)["level"] == 1
    assert run(lab_signal=1.999)["level"] == 0
    assert run(risk=5, lab_signal=3.0)["level"] == 1      # 2.0 * 1.5
    assert run(risk=5, lab_signal=2.999)["level"] == 0
    r = run(predictions=[pred(50)], observations=[obs(1, 5)], lab_signal=0.5)
    assert r["signal"]["total"] == pytest.approx(1.0 + OBSERVATION_WEIGHT + 0.5)


def test_distance_to_next_level():
    r = run()
    assert r["level"] == 0 and r["next_level"] == 1 and r["to_next"] == pytest.approx(BASE_THRESHOLDS[1])
    top = run(lab_signal=BASE_THRESHOLDS[-1])
    assert top["level"] == len(BASE_THRESHOLDS) - 1 and top["next_level"] is None and top["to_next"] is None


def test_skill_multiplier_from_history():
    assert run()["skill_multiplier"] == 1.0                                   # новичок
    assert run(history_hits=10)["skill_multiplier"] == 1.0                    # одни успехи: меры нет
    # поровну успехов и промахов при уверенности 50: умения нет, доверие растет с числом редких исходов
    z = 6 / (6 + CREDIBILITY_K)
    r = run(history_hits=6, history_misses=6, history_confidence=50)
    assert r["skill_multiplier"] == pytest.approx(1 - z * (1 - MULTIPLIER_FLOOR))
    # уверенный и точный: множитель остается около 1
    sharp = mm.skill_multiplier([(99, "подтвердился")] * 5 + [(1, "не подтвердился")] * 5)
    assert sharp == pytest.approx(1.0, abs=1e-3)
    # уверенный и неточный: ниже 1, но не ниже пола
    bad = mm.skill_multiplier([(99, "не подтвердился")] * 5 + [(99, "подтвердился")] * 5)
    assert MULTIPLIER_FLOOR <= bad < 1.0


def test_history_scales_prediction_contribution():
    base = run(predictions=[pred(50)])["signal"]["predictions"]
    weak = run(predictions=[pred(50)], history_hits=6, history_misses=6, history_confidence=50)
    assert weak["signal"]["predictions"] == pytest.approx(base * weak["skill_multiplier"])
    assert weak["skill_multiplier"] < 1.0


@pytest.mark.parametrize("kw", [
    dict(risk=mm.RISK_MAX + 1), dict(risk=-1), dict(risk=True),
    dict(predictions=[pred(50)] * (mm.MAX_ITEMS + 1)),
    dict(observations=[obs(1, 1)] * (mm.MAX_ITEMS + 1)),
    dict(predictions=[{"confidence": 101, "outcome": "confirmed"}]),
    dict(predictions=[{"confidence": 50, "outcome": "nope"}]),
    dict(observations=[obs(0, 1)]), dict(observations=[obs(1, 99)]),
    dict(lab_signal=float("nan")), dict(lab_signal=mm.LAB_SIGNAL_LIMIT + 1),
    dict(history_hits=mm.MAX_HISTORY + 1), dict(history_misses=-1), dict(history_confidence=101),
])
def test_bad_input_is_rejected(kw):
    with pytest.raises(ValueError):
        run(**kw)
