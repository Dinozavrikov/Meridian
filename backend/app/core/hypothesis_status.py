"""Статусы гипотезы — единый источник (чистый модуль без импортов, безопасен для api/services/core).
Зеркало на фронте: frontend/lib/hypothesis-constants.ts; Literal HypothesisStatus в schemas/entities.py
(синхронность держат tests/test_hypothesis_status_validation.py и frontend/lib/hypothesis-constants.test.ts).
Три группы нужны статистике профиля (api/v1/users.py): они не пересекаются и в сумме дают все статусы."""

HYPOTHESIS_STATUSES = (
    "идея", "активная проверка", "ожидание данных", "заморожена",
    "отвергнута", "частично подтверждена", "подтвердилось", "требует пересмотра",
)
DEFAULT_HYPOTHESIS_STATUS = "идея"

CONFIRMED_HYPOTHESIS_STATUSES = ("частично подтверждена", "подтвердилось")
PENDING_HYPOTHESIS_STATUSES = ("идея", "активная проверка", "ожидание данных", "заморожена")
REJECTED_HYPOTHESIS_STATUSES = ("отвергнута", "требует пересмотра")
