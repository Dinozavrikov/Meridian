import { api } from "@/lib/api"

// Аналог contradiction-api.ts, но для другой задачи: не "найди противоречие",
// а "отвечает ли что-то из твоего корпуса на этот открытый вопрос" (см.
// backend/app/services/question_answers.py). Explicit-проверка по клику —
// та же философия "явный клик, не автотриггер", что у ContradictionNudge.
export interface QuestionAnswerItem {
  feedback_id: number
  question_id: number
  entity_type: string
  entity_id: number
  quote: string
  confidence: number
}

export const questionAnswerApi = {
  check: (questionId: number) =>
    api.post(`/api/v1/questions/${questionId}/check-answers`).then(r => r.data as QuestionAnswerItem[]),
  setVerdict: (feedbackId: number, verdict: "accepted" | "rejected") =>
    api.post(`/api/v1/questions/answer-feedback/${feedbackId}/verdict`, { verdict }).then(r => r.data),
  listPending: () =>
    api.get("/api/v1/questions/answer-feedback/pending").then(r => r.data as QuestionAnswerItem[]),
}
