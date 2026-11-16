"""
Тесты на математику ядра: калибровка, сигнал, зрелость.
Чистые функции — не нужен DB, не нужен LLM.
"""

import math
import pytest
from app.services.hypothesis_evidence import (
    prediction_contribution,
    brier_component,
    level_from_signal,
    risk_multiplier,
    derive_scope,
)


class TestPredictionContribution:
    """Surprisal-вес прогноза: уверенный + подтвердился = слабый сигнал,
    уверенный + не подтвердился = сильный штраф."""

    def test_confident_correct_is_weak(self):
        """Уверенность 90%, подтвердился → слабый positive."""
        val = prediction_contribution(90, "подтвердился")
        assert val > 0
        assert val < 0.5  # -log2(0.9) ≈ 0.15

    def test_confident_wrong_is_strong_penalty(self):
        """Уверенность 90%, не подтвердился → сильный negative."""
        val = prediction_contribution(90, "не подтвердился")
        assert val < -1.5  # log2(0.1) ≈ -3.32

    def test_50_50_is_neutral_direction(self):
        """При 50% уверенности подтверждение даёт ровно 1."""
        val = prediction_contribution(50, "подтвердился")
        assert val == pytest.approx(1.0)

    def test_partial_confirms_half(self):
        """Частично подтвердился → половина сигнала."""
        full = prediction_contribution(80, "подтвердился")
        partial = prediction_contribution(80, "частично подтвердился")
        assert partial == pytest.approx(full / 2)

    def test_none_confidence_defaults_to_50(self):
        """Без указания уверенности — 50%."""
        assert prediction_contribution(None, "подтвердился") == pytest.approx(1.0)

    def test_unknown_status_returns_zero(self):
        """Неизвестный статус → нет сигнала."""
        assert prediction_contribution(80, "какой-то бред") == 0.0


class TestBrierComponent:
    """Brier score: (actual - confidence)^2."""

    def test_perfect_prediction(self):
        """100% уверенность, подтвердился → 0."""
        assert brier_component(100, "подтвердился") == pytest.approx(0.0)

    def test_perfectly_wrong(self):
        """0% уверенность, подтвердился → 1."""
        assert brier_component(0, "подтвердился") == pytest.approx(1.0)

    def test_50_50_always_half(self):
        """При 50% Brier всегда 0.25 независимо от исхода."""
        assert brier_component(50, "подтвердился") == pytest.approx(0.25)
        assert brier_component(50, "не подтвердился") == pytest.approx(0.25)
        assert brier_component(50, "частично подтвердился") == pytest.approx(0.0)

    def test_partial_is_half_actual(self):
        """Частично подтвердился → actual=0.5."""
        assert brier_component(50, "частично подтвердился") == pytest.approx(0.0)


class TestLevelFromSignal:
    """Переходы между уровнями зрелости."""

    def test_zero_signal_is_level_0(self):
        assert level_from_signal(0.0, risk=0) == 0

    def test_exactly_at_threshold(self):
        """raw_signal == threshold → переход на этот уровень."""
        assert level_from_signal(2.0, risk=0) == 1
        assert level_from_signal(5.0, risk=0) == 2
        assert level_from_signal(10.0, risk=0) == 3
        assert level_from_signal(18.0, risk=0) == 4

    def test_high_risk_raises_threshold(self):
        """risk=10 → multiplier=2.0, пороги удваиваются."""
        assert level_from_signal(3.9, risk=10) == 0  # < 2*2=4
        assert level_from_signal(4.0, risk=10) == 1  # == 4

    def test_max_level_is_4(self):
        """Не выходим за пределы массива."""
        assert level_from_signal(999.0, risk=0) == 4


class TestRiskMultiplier:
    def test_zero_risk_is_one(self):
        assert risk_multiplier(0) == 1.0

    def test_risk_10_is_double(self):
        assert risk_multiplier(10) == 2.0


class TestDeriveScope:
    def test_private_is_personal(self):
        assert derive_scope("private", None, 42) == ("personal", "42")

    def test_public_is_public(self):
        assert derive_scope("public", None, 42) == ("public", "42")

    def test_lab_with_id(self):
        assert derive_scope("lab", 7, 42) == ("lab", "7")

    def test_lab_without_id_fallback(self):
        """lab без lab_id → personal (defensive)."""
        assert derive_scope("lab", None, 42) == ("personal", "42")
