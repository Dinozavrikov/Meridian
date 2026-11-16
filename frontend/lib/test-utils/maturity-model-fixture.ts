// Образец ответа сервиса для тестов страницы документации (форма закреплена tests/test_maturity_model_shape.py).
import type { MaturityModel, SimResult } from "@/lib/maturity-model"

const BASE = [0, 2, 5, 10, 18]
const row = (risk: number) => ({ risk, multiplier: 1 + risk / 10, thresholds: BASE.map(t => t * (1 + risk / 10)) })

export const MODEL: MaturityModel = {
  terms: ["predictions", "observations", "lab", "skill", "risk"],
  outcomes: ["confirmed", "partial", "refuted"],
  levels: { min: 0, max: 4, base_thresholds: BASE },
  risk: { min: 0, max: 10, scale: 10, table: [row(0), row(5), row(10)] },
  observation: { weight: 0.3, importance_max: 5, max_contribution: 0.3 },
  prediction: {
    default_confidence: 50, confidence_floor_pct: 1, confidence_ceil_pct: 99, partial_share: 0.5,
    examples: [50, 70, 90].map(c => ({ confidence: c, confirmed: -Math.log2(c / 100), partial: -0.5 * Math.log2(c / 100), refuted: Math.log2(1 - c / 100) })),
  },
  skill: { floor: 0.5, neutral: 1, credibility_k: 8 },
  calibration: { min_tag_n: 5 },
  diversity: { similarity_threshold: 0.92, confirming_min_count: 2, refuting_min_count: 1, narrow_base: 1 },
  limits: { max_items: 30, max_history: 200, lab_signal: 100 },
}

export const RESULT: SimResult = {
  skill_multiplier: 1, risk_multiplier: 1.5, thresholds: [0, 3, 7.5, 15, 27],
  predictions: [{ contribution: 0.51 }, { contribution: 0.15 }], observations: [{ contribution: 0.18 }],
  signal: { predictions: 0.66, observations: 0.18, lab: 5.36, total: 6.2 }, level: 1, next_level: 2, to_next: 1.3,
}
