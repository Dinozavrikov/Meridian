// Модель зрелости для страницы документации: типы ответа сервиса, вызовы и подстановка чисел в тексты.
// Форма ответа закреплена бэкенд-тестом tests/test_maturity_model_shape.py: менять их нужно вместе.
import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/api"
import type { MODEL_VARS } from "@/lib/docs"

export interface MaturityModel {
  terms: string[]
  outcomes: string[]
  levels: { min: number; max: number; base_thresholds: number[] }
  risk: { min: number; max: number; scale: number; table: { risk: number; multiplier: number; thresholds: number[] }[] }
  observation: { weight: number; importance_max: number; max_contribution: number }
  prediction: {
    default_confidence: number; confidence_floor_pct: number; confidence_ceil_pct: number; partial_share: number
    examples: { confidence: number; confirmed: number; partial: number; refuted: number }[]
  }
  skill: { floor: number; neutral: number; credibility_k: number }
  calibration: { min_tag_n: number }
  diversity: { similarity_threshold: number; confirming_min_count: number; refuting_min_count: number; narrow_base: number }
  limits: { max_items: number; max_history: number; lab_signal: number }
}

export interface SimPrediction { confidence: number | null; outcome: string; confirms_if_true: boolean }
export interface SimObservation { sign: 1 | -1; importance: number | null }
export interface SimInput {
  risk: number; predictions: SimPrediction[]; observations: SimObservation[]
  lab_signal: number; history_hits: number; history_misses: number; history_confidence: number
}
export interface SimResult {
  skill_multiplier: number
  risk_multiplier: number
  thresholds: number[]
  predictions: { contribution: number }[]
  observations: { contribution: number }[]
  signal: { predictions: number; observations: number; lab: number; total: number }
  level: number
  next_level: number | null
  to_next: number | null
}

export const maturityModelApi = {
  get: () => api.get<MaturityModel>("/api/v1/meta/maturity-model").then(r => r.data),
  simulate: (body: SimInput, signal?: AbortSignal) =>
    api.post<SimResult>("/api/v1/meta/maturity-model/simulate", body, { signal }).then(r => r.data),
}

export const useMaturityModel = () =>
  useQuery({ queryKey: ["maturity-model"], queryFn: maturityModelApi.get, staleTime: 5 * 60 * 1000 })

/** Число по правилам локали; минус рисуется настоящим знаком минус. */
export function fmtNumber(n: number, locale: string, digits = 2): string {
  let s: string
  try {
    s = new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(n)
  } catch {
    s = new Intl.NumberFormat("ru", { maximumFractionDigits: digits }).format(n)
  }
  return s.replace("-", "−")
}

/** Все плейсхолдеры текстов документации, посчитанные из модели. Тип требует полного набора MODEL_VARS. */
export function docsVars(m: MaturityModel, locale: string): Record<typeof MODEL_VARS[number], string> {
  const f = (n: number, d = 2) => fmtNumber(n, locale, d)
  const ex = [...m.prediction.examples].sort((a, b) => a.confidence - b.confidence)
  const lo = ex[0]
  const hi = ex[ex.length - 1]
  const top = m.risk.table.reduce((a, b) => (b.risk > a.risk ? b : a))
  const base = m.levels.base_thresholds
  return {
    k: f(m.skill.credibility_k), floor: f(m.skill.floor), neutral: f(m.skill.neutral),
    dflt: String(m.prediction.default_confidence),
    cfloor: String(m.prediction.confidence_floor_pct), cceil: String(m.prediction.confidence_ceil_pct),
    partial: f(m.prediction.partial_share),
    imp: f(m.observation.importance_max, 0), w: f(m.observation.weight), maxObs: f(m.observation.max_contribution),
    scale: f(m.risk.scale, 0), rmax: String(m.risk.max), maxMult: f(top.multiplier),
    lmax: String(m.levels.max), thr: base.slice(1).map(x => f(x)).join(", "), t1: f(base[1]),
    chi: String(hi.confidence), clo: String(lo.confidence),
    vhi: f(hi.confirmed), vlo: f(lo.confirmed), vmiss: f(hi.refuted),
    sim: f(m.diversity.similarity_threshold),
    cmin: String(m.diversity.confirming_min_count), rmin: String(m.diversity.refuting_min_count),
    narrow: String(m.diversity.narrow_base),
  }
}
