import { api } from "@/lib/api"

// Полиморфно по entity_type/entity_id на бэкенде (см. contradictions.py) —
// единственный API-клиент для всех сущностей (Observation/Hypothesis/
// Prediction), в отличие от reflection-api.ts не нужна карта "тип -> объект",
// потому что бэкенд-эндпоинт уже принимает entity_type как параметр тела,
// а не как часть URL.
export type ContradictionEntityType = "observation" | "hypothesis" | "prediction" | "worldview"

export interface ContradictionItem {
  feedback_id: number
  entity_type: ContradictionEntityType
  entity_id: number
  existing_quote: string
  new_quote: string
  relation: string
  confidence: number
}

export const contradictionApi = {
  check: (entityType: ContradictionEntityType, entityId: number, text: string) =>
    api.post("/api/v1/contradictions/check", { entity_type: entityType, entity_id: entityId, text })
      .then(r => r.data as ContradictionItem[]),
  setVerdict: (feedbackId: number, verdict: "accepted" | "rejected") =>
    api.post(`/api/v1/contradictions/${feedbackId}/verdict`, { verdict }).then(r => r.data),
}
