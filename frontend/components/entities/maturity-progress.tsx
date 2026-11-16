"use client"
import { useQuery } from "@tanstack/react-query"
import { hypApi } from "@/lib/api"
import { useT } from "@/lib/i18n/useT"
import { ink } from "@/lib/theme"
import { MaturityBar, f2 } from "@/components/entities/maturity-bar"

/**
 * Сколько сигнала накоплено до следующего уровня зрелости (владелец гипотезы).
 * Числа считает сервер (GET /hypotheses/{id}/maturity-progress, та же формула, что у предложения),
 * вид общий с вкладкой лаборатории (MaturityBar). Объясняет, почему предложения пока нет.
 */
export function MaturityProgress({ hypothesisId }: { hypothesisId: number }) {
  const t = useT()
  const { data: p } = useQuery({
    queryKey: ["maturity-progress", hypothesisId],
    queryFn: () => hypApi.maturityProgress(hypothesisId),
  })
  if (!p || p.total_signal == null) return null
  return (
    <MaturityBar total={p.total_signal} threshold={p.next_threshold} nextLevel={p.next_level} titleKey="maturityProgress.title" showReady>
      <div style={{ fontSize: 12, color: ink.label, lineHeight: 1.5 }}>
        {t("maturityProgress.parts", { pred: f2(p.pred_signal), obs: f2(p.obs_signal), lab: f2(p.lab_signal) })}
      </div>
    </MaturityBar>
  )
}
