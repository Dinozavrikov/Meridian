/** Эффект связи на сигнал гипотезы (поле effect от бэкенда, services/link_effect.py). Числа считает сервер,
 *  здесь только слова и пороги: до 0.5 — слабо, до 2 — заметно, от 2 — сильно (по модулю). */
export interface LabEffect { value: number; mine: number; votes: { n: number; mean: number } | null }
export interface LinkEffect { kind: "counted" | "pending" | "unknown" | "not_counted" | "lab_only"; value: number | null; lab?: LabEffect }

export interface EffectView {
  labelKey: string; tipKey: string; tone: "pos" | "neg" | "neutral"; arrow: string; number: string | null
}

const WEAK_MAX = 0.5
const MEDIUM_MAX = 2

export interface LabEffectView {
  labelKey: string; tipKey: string; tone: "pos" | "neg" | "neutral"; arrow: string; number: string; mine: string | null; votesPct: number | null; votesN: number | null
}

const fmt = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(2)}`

/** Лабораторная часть эффекта: слово по тем же порогам, что у личной; mine — доля зрителя (null, если нулевая);
 *  votesPct — доля голосов «за» из среднего знака (mean от -1 до 1 → 0..100%). */
export function describeLabEffect(l: LabEffect, otherType: string): LabEffectView {
  const abs = Math.abs(l.value)
  const tone = Math.abs(l.value) < 1e-9 ? "neutral" : l.value > 0 ? "pos" : "neg"
  const level = abs < WEAK_MAX ? "weak" : abs < MEDIUM_MAX ? "medium" : "strong"
  return {
    labelKey: tone === "neutral" ? "effectLab.zero" : `effectLab.${level}.${tone}`,
    tipKey: otherType === "prediction" ? "effectLab.tip.prediction" : "effectLab.tip.observation",
    tone, arrow: tone === "pos" ? "↑" : tone === "neg" ? "↓" : "–", number: fmt(l.value),
    mine: Math.abs(l.mine) < 1e-9 ? null : fmt(l.mine),
    votesPct: l.votes ? Math.round((l.votes.mean + 1) / 2 * 100) : null, votesN: l.votes ? l.votes.n : null,
  }
}

export function describeEffect(e: LinkEffect, otherType: string): EffectView {
  if (e.kind === "lab_only") return { labelKey: "effect.labOnly", tipKey: "effect.tip.labOnly", tone: "neutral", arrow: "", number: null }
  if (e.kind === "pending") return { labelKey: "effect.pending", tipKey: "effect.tip.pending", tone: "neutral", arrow: "…", number: null }
  if (e.kind === "unknown") return { labelKey: "effect.unknown", tipKey: "effect.tip.unknown", tone: "neutral", arrow: "?", number: null }
  if (e.kind === "not_counted" || e.value == null) return { labelKey: "effect.notCounted", tipKey: "effect.tip.notCounted", tone: "neutral", arrow: "–", number: null }
  const v = e.value
  const tipKey = otherType === "prediction" ? "effect.tip.prediction" : "effect.tip.observation"
  const number = `${v > 0 ? "+" : ""}${v.toFixed(2)}`
  if (Math.abs(v) < 1e-9) return { labelKey: "effect.zero", tipKey, tone: "neutral", arrow: "–", number }
  const abs = Math.abs(v)
  const level = abs < WEAK_MAX ? "weak" : abs < MEDIUM_MAX ? "medium" : "strong"
  const sign = v > 0 ? "pos" : "neg"
  return { labelKey: `effect.${level}.${sign}`, tipKey, tone: sign, arrow: v > 0 ? "↑" : "↓", number }
}
