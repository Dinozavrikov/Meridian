import { describe, expect, it } from "vitest"
import { STRINGS } from "@/lib/i18n/strings"
import { NODES } from "@/lib/features-map"
import { buildMetrics, type DashboardStats } from "@/lib/use-personal-feature-metrics"

const S = STRINGS as Record<string, string>
const stats = (over: Partial<DashboardStats> = {}): DashboardStats => ({
  totals: { observations: 12, hypotheses: 5, predictions: 7, worldview: 3, questions: 4, tasks: 2 },
  pred_accuracy: 73, practice_rank: { label: "Практик", progress_pct: 40 }, ...over,
})

describe("метрики карты функций", () => {
  it("записи показывают свое число", () => {
    const m = buildMetrics(stats(), undefined)
    expect(m("observation")?.value).toBe("12")
    expect(m("question")?.value).toBe("4")
    expect(m("worldview")?.value).toBe("3")
    expect(m("task")?.value).toBe("2")
  })
  it("у гипотез уровень практики, а без него число гипотез", () => {
    expect(buildMetrics(stats(), undefined)("hypothesis")?.value).toContain("40%")
    expect(buildMetrics(stats({ practice_rank: null }), undefined)("hypothesis")?.value).toBe("5")
  })
  it("у прогнозов точность, нулевая точность это 0%, а не пропуск", () => {
    expect(buildMetrics(stats(), undefined)("prediction")?.value).toBe("73%")
    expect(buildMetrics(stats({ pred_accuracy: 0 }), undefined)("prediction")?.value).toBe("0%")
    expect(buildMetrics(stats({ pred_accuracy: null }), undefined)("prediction")?.value).toBe("7")
  })
  it("шкалы не зависят от дашборда, а без данных узлы молчат", () => {
    expect(buildMetrics(undefined, 3)("scales")?.value).toBe("3")
    expect(buildMetrics(undefined, undefined)("scales")).toBeNull()
    expect(buildMetrics(undefined, 3)("observation")).toBeNull()
  })
  it("узлы без счетчика на бэкенде ничего не показывают, а подписи метрик заведены", () => {
    const m = buildMetrics(stats(), 2)
    for (const n of NODES) {
      const x = m(n.key)
      if (x) expect(S[x.labelKey]?.trim(), x.labelKey).toBeTruthy()
    }
    for (const k of ["graph", "feed", "labs", "messages", "history", "trash"] as const) expect(m(k), k).toBeNull()
  })
})
