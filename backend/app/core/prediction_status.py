"""Статусы исхода прогноза — единый источник (чистый модуль без импортов, безопасен
для api/services/core, циклов не создаёт). Не копировать кортежи литералами:
добавленный позже статус иначе молча выпадет из части выборок и калибровки.

CLOSED — исход известен; вклад прогноза уже внесён в сигнал гипотезы (process_prediction_close:
hypothesis.evidence_signal копится прибавлением и не пересчитывается), а калибровка читает
confidence живьём, поэтому confidence и исход закрытого прогноза не редактируются и не
откатываются (см. services/undo.py, PUT в api/v1/predictions.py).
CONFIRMED — подмножество CLOSED, засчитываемое как «сбылся» (полностью или частично).
Веса исходов (1.0 / 0.5 / 0.0) — отдельно, в services/hypothesis_evidence.py."""

CLOSED_PREDICTION_STATUSES = ("подтвердился", "частично подтвердился", "не подтвердился")
CONFIRMED_PREDICTION_STATUSES = ("подтвердился", "частично подтвердился")

# Единственный источник правды по «открытому» статусу прогноза. Дефолты в models/entities.py и
# schemas/entities.py держат литерал (импорт app.core оттуда не проверялся на циклы) — равенство
# константе стережёт tests/test_prediction_open_status_single_source.py.
OPEN_PREDICTION_STATUS = "не проверен"
PREDICTION_STATUSES = (OPEN_PREDICTION_STATUS, *CLOSED_PREDICTION_STATUSES)
