/** Зеркало backend/app/core/prediction_status.py — единый список статусов исхода прогноза.
 *  Вклад закрытого прогноза уже внесён в сигнал гипотезы (backend process_prediction_close:
 *  evidence_signal копится прибавлением), а калибровка читает уверенность живьём — поэтому исход
 *  и уверенность закрытого прогноза не редактируются; закрывает только кнопка «Записать исход»
 *  (PUT /predictions/{id}/close). Не копировать список литералами в компонентах. */
export const OPEN_PREDICTION_STATUS = "не проверен"
export const CLOSED_PREDICTION_STATUSES = ["подтвердился", "частично подтвердился", "не подтвердился"] as const

export const isClosedPrediction = (status?: string | null): boolean =>
  !!status && (CLOSED_PREDICTION_STATUSES as readonly string[]).includes(status)

/** Все допустимые статусы прогноза (открытый + закрытые). Зеркало Literal PredictionStatus
 *  в backend/app/schemas/entities.py — синхронность держит lib/prediction-status.test.ts. */
export const PREDICTION_STATUSES: string[] = [OPEN_PREDICTION_STATUS, ...CLOSED_PREDICTION_STATUSES]
