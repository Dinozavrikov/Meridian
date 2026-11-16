// frontend/lib/hypothesis-constants.ts
//
// Единственный источник правды по статусам гипотезы на фронте (раньше жил в hypothesis-form.tsx).
// Зеркало backend/app/core/hypothesis_status.py и Literal HypothesisStatus в schemas/entities.py —
// синхронность держит hypothesis-constants.test.ts.
export const HYPOTHESIS_STATUSES: string[] = [
  "идея", "активная проверка", "ожидание данных", "заморожена",
  "отвергнута", "частично подтверждена", "подтвердилось", "требует пересмотра",
]
export const DEFAULT_HYPOTHESIS_STATUS = "идея"
