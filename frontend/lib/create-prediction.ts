// frontend/lib/create-prediction.ts — «создать прогноз целиком» (см. create-entity-full.ts):
// страница, вкладка лаборатории, AddForecastModal и quick-add зовут одну и ту же функцию.
// confirms_hypothesis_if_true в PUT не шлём: бэкенд оставляет непришедшие поля как есть
// (api/v1/predictions.py, PUT).
import { predApi } from "@/lib/api"
import { makeCreateFull } from "@/lib/create-entity-full"
import type { EntitySubmit } from "@/lib/entity-submit"

export type PredictionSubmit = EntitySubmit

export const createPredictionFull = makeCreateFull({
  entityType: "prediction",
  api: predApi,
  textField: "text",
  buildUpdate: (c, text) => ({
    title: c.title, text, date_created: c.date_created, expected_check_date: c.expected_check_date,
    hypothesis_id: c.hypothesis_id, status: c.status, result_notes: c.result_notes, confidence: c.confidence,
    visibility: c.visibility, lab_id: c.lab_id,
  }),
})
