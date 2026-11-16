"""Форма ответа модели зрелости закреплена: менять ее нужно вместе с frontend/lib/maturity-model.ts.
И проверка, что в формуле не осталось неименованных литералов."""
from app.services import hypothesis_evidence as he
from app.services import maturity_model as mm


def test_model_shape_is_pinned():
    d = mm.describe_model()
    assert set(d) == {"terms", "outcomes", "levels", "risk", "observation", "prediction", "skill",
                      "calibration", "diversity", "limits"}
    assert set(d["levels"]) == {"min", "max", "base_thresholds"}
    assert set(d["risk"]) == {"min", "max", "scale", "table"}
    assert set(d["risk"]["table"][0]) == {"risk", "multiplier", "thresholds"}
    assert set(d["observation"]) == {"weight", "importance_max", "max_contribution"}
    assert set(d["prediction"]) == {"default_confidence", "confidence_floor_pct", "confidence_ceil_pct",
                                    "partial_share", "examples"}
    assert set(d["prediction"]["examples"][0]) == {"confidence", "confirmed", "partial", "refuted"}
    assert set(d["skill"]) == {"floor", "neutral", "credibility_k"}
    assert set(d["calibration"]) == {"min_tag_n"}
    assert set(d["diversity"]) == {"similarity_threshold", "confirming_min_count", "refuting_min_count", "narrow_base"}
    assert set(d["limits"]) == {"max_items", "max_history", "lab_signal"}


def test_risk_scale_is_the_only_source_of_the_risk_divisor(monkeypatch):
    assert mm.describe_model()["risk"]["scale"] == he.RISK_SCALE
    assert he.risk_multiplier(mm.RISK_MAX) == 1 + mm.RISK_MAX / he.RISK_SCALE
    # меняем константу: поведение формулы обязано поехать вместе с ней, значит литерала 10 в расчете не осталось
    monkeypatch.setattr(he, "RISK_SCALE", 5.0)
    assert he.risk_multiplier(5) == 2.0
    assert he.scaled_thresholds(5) == [t * 2.0 for t in he.BASE_THRESHOLDS]
    assert he.level_from_signal(he.BASE_THRESHOLDS[1] * 2.0, 5) == 1
    assert he.level_from_signal(he.BASE_THRESHOLDS[1] * 2.0 - 0.001, 5) == 0
