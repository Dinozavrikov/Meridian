"""Слой 2 калибровки (calibration_source.py, 29.09): пересчёт на лету из сырых прогнозов
вместо копилки CalibrationStat (та могла только прибавлять — переоткрытие или смену
видимости/лабы у закрытого прогноза откатить было нечем, это и объясняло расхождение
35 vs 21 на проде). Юнит-часть — calibration_score на голых списках, без БД."""
import pytest

from app.services.calibration_source import calibration_score, CREDIBILITY_K


class TestCalibrationScore:
    def test_no_rows_returns_none(self):
        """0 закрытых — вызывающий сам решает нейтральное значение (multiplier: 1.0,
        сводка: скрыть блок), формула не может сама выбрать баланс между этими случаями."""
        assert calibration_score([], baseline=1.0) is None

    def test_perfect_calibration_pulls_score_toward_one(self):
        # z = 20/(20+K=8) = 0.714, brier=0 -> score = 0.714*1.0 + 0.286*0.5 = 0.857
        rows = [(100, "подтвердился")] * 20
        result = calibration_score(rows, baseline=0.5)
        assert result["score"] > 0.8
        assert result["n_closed"] == 20

    def test_always_wrong_pulls_score_toward_zero(self):
        # тот же z, brier=1 -> score = 0.714*0.0 + 0.286*0.5 = 0.143
        rows = [(100, "не подтвердился")] * 20
        result = calibration_score(rows, baseline=0.5)
        assert result["score"] < 0.2

    def test_small_n_stays_close_to_baseline(self):
        """Один прогноз, даже идеальный, не должен взлетать к 100% — Бюльман тянет к baseline."""
        result = calibration_score([(100, "подтвердился")], baseline=0.5)
        assert result["score"] < 0.7

    def test_z_grows_with_n(self):
        few = calibration_score([(70, "подтвердился")] * 2, baseline=0.5)["z"]
        many = calibration_score([(70, "подтвердился")] * 40, baseline=0.5)["z"]
        assert few < many < 1.0

    def test_baseline_only_matters_at_low_n(self):
        rows = [(80, "подтвердился")] * 200  # n >> CREDIBILITY_K — baseline почти не влияет
        a = calibration_score(rows, baseline=0.0)["score"]
        b = calibration_score(rows, baseline=1.0)["score"]
        assert abs(a - b) < 0.05

    def test_credibility_k_is_positive(self):
        assert CREDIBILITY_K > 0
