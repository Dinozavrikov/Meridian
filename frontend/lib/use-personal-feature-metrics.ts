import { useQuery } from "@tanstack/react-query"
import axios from "axios"
import type { NodeKey } from "@/lib/features-map"

/** Подпись и значение стоят рядом, поэтому склонять слова не нужно. labelKey это ключ useT. */
export interface FeatureMetric { labelKey: string; value: string }

export interface DashboardStats {
  totals: { observations: number; hypotheses: number; predictions: number; worldview: number; questions: number; tasks: number }
  pred_accuracy: number | null
  practice_rank: { label: string; progress_pct: number } | null
}

/** Чистая часть: что показать у каждого узла. Узлы без счетчика на бэкенде получают null, а не заглушку. */
export function buildMetrics(d: DashboardStats | undefined, customScales: number | undefined): (key: NodeKey) => FeatureMetric | null {
  return key => {
    if (key === "scales") return customScales == null ? null : { labelKey: "featuresPage.metric.scales", value: String(customScales) }
    if (!d) return null
    const count = (n: number): FeatureMetric => ({ labelKey: "featuresPage.metric.records", value: String(n) })
    switch (key) {
      case "observation": return count(d.totals.observations)
      case "question": return count(d.totals.questions)
      case "worldview": return count(d.totals.worldview)
      case "task": return count(d.totals.tasks)
      case "hypothesis":
        return d.practice_rank
          ? { labelKey: "featuresPage.metric.rank", value: `${d.practice_rank.label} · ${d.practice_rank.progress_pct}%` }
          : count(d.totals.hypotheses)
      case "prediction":
        return d.pred_accuracy != null ? { labelKey: "featuresPage.metric.accuracy", value: `${d.pred_accuracy}%` } : count(d.totals.predictions)
      default: return null
    }
  }
}

export function usePersonalFeatureMetrics(enabled: boolean) {
  const stats = useQuery({
    queryKey: ["stats-dashboard"],
    queryFn: async () => (await axios.get<DashboardStats>("/api/v1/stats/dashboard", { withCredentials: true })).data,
    enabled,
  })
  const scales = useQuery({
    queryKey: ["scales-defs-count"],
    queryFn: async () => (await axios.get<unknown[]>("/api/v1/scales/defs", { withCredentials: true })).data,
    enabled,
  })
  return { metricFor: buildMetrics(stats.data, scales.data?.length), isError: stats.isError || scales.isError }
}
