import { describe, expect, it } from "vitest"
import { STRINGS } from "@/lib/i18n/strings"
import { CALL_VARS, MODEL_VARS } from "@/lib/docs"
import { docsVars, fmtNumber, type MaturityModel } from "@/lib/maturity-model"

const BASE = [0, 2, 5, 10, 18]
const row = (risk: number) => ({ risk, multiplier: 1 + risk / 10, thresholds: BASE.map(t => t * (1 + risk / 10)) })
const MODEL: MaturityModel = {
  terms: ["predictions", "observations", "lab", "skill", "risk"],
  outcomes: ["confirmed", "partial", "refuted"],
  levels: { min: 0, max: 4, base_thresholds: BASE },
  risk: { min: 0, max: 10, scale: 10, table: [row(0), row(5), row(10)] },
  observation: { weight: 0.3, importance_max: 5, max_contribution: 0.3 },
  prediction: {
    default_confidence: 50, confidence_floor_pct: 1, confidence_ceil_pct: 99, partial_share: 0.5,
    examples: [50, 70, 90].map(c => ({
      confidence: c, confirmed: -Math.log2(c / 100), partial: -0.5 * Math.log2(c / 100), refuted: Math.log2(1 - c / 100),
    })),
  },
  skill: { floor: 0.5, neutral: 1, credibility_k: 8 },
  calibration: { min_tag_n: 5 },
  diversity: { similarity_threshold: 0.92, confirming_min_count: 2, refuting_min_count: 1, narrow_base: 1 },
  limits: { max_items: 30, max_history: 200, lab_signal: 100 },
}

describe("fmtNumber", () => {
  it("уважает локаль и рисует настоящий минус", () => {
    expect(fmtNumber(0.3, "ru")).toBe("0,3")
    expect(fmtNumber(0.3, "en")).toBe("0.3")
    expect(fmtNumber(-3.32, "ru")).toBe("−3,32")
    expect(fmtNumber(1, "ru")).toBe("1")
  })
  it("неизвестная локаль не роняет страницу", () => {
    expect(fmtNumber(2, "not a locale")).toBe("2")
  })
})

describe("docsVars", () => {
  const v = docsVars(MODEL, "ru")
  it("дает ровно тот набор плейсхолдеров, который знает страница", () => {
    expect(Object.keys(v).sort()).toEqual([...MODEL_VARS].sort())
  })
  it("значения читаются из модели", () => {
    expect(v.thr).toBe("2, 5, 10, 18")
    expect(v.t1).toBe("2")
    expect(v.maxMult).toBe("2")
    expect(v.chi).toBe("90")
    expect(v.clo).toBe("50")
    expect(v.vhi).toBe("0,15")
    expect(v.vlo).toBe("1")
    expect(v.vmiss).toBe("−3,32")
    expect(v.sim).toBe("0,92")
    expect(v.lmax).toBe("4")
  })
  it("после подстановки ни в одном тексте документации не остается плейсхолдера", () => {
    const all: Record<string, string> = { ...v, n: "1", r: "5", level: "x", items: "y" }
    expect(Object.keys(all).sort()).toEqual([...MODEL_VARS, ...CALL_VARS].sort())
    for (const [k, text] of Object.entries(STRINGS)) {
      if (!k.startsWith("docsPage.")) continue
      const out = Object.entries(all).reduce((acc, [n, val]) => acc.replaceAll(`{${n}}`, val), text)
      expect(/\{\w+\}/.test(out), `${k}: ${out.slice(0, 80)}`).toBe(false)
    }
  })
  it("готовые фразы читаются правильно", () => {
    const t = (k: string) => Object.entries(v).reduce((a, [n, x]) => a.replaceAll(`{${n}}`, x), STRINGS[k])
    expect(t("docsPage.principle.miss.text")).toContain("−3,32")
    expect(t("docsPage.faq.item.slow.a")).toContain("0,15")
  })
})
