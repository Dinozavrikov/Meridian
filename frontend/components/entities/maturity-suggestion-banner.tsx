"use client"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { hypApi } from "@/lib/api"
import { TrendingUp, TrendingDown, Check, X } from "lucide-react"
import { useT } from "@/lib/i18n/useT"
import { useDynamicTranslate } from "@/lib/i18n/useDynamicT"
import { collectStrings } from "@/lib/i18n/collect-strings"
import { DEFAULT_SCALES } from "@/lib/scales"
import { ActionButton } from "@/components/ui/action-button"
import { ink, theme } from "@/lib/theme"
import { readableOn } from "@/lib/color"

const MATURITY = DEFAULT_SCALES.find(s => s.id === "maturity" && s.entity_type === "hypothesis")!

/**
 * Предложение изменить зрелость гипотезы по формуле (калибровка + surprisal
 * по закрытым прогнозам + связанные наблюдения). Никогда не применяется
 * автоматически — только показывает обоснование и ждёт accept/dismiss.
 */
export function MaturitySuggestionBanner({ hypothesisId }: { hypothesisId: number }) {
  const t = useT()
  const dt = useDynamicTranslate(collectStrings(DEFAULT_SCALES))
  const qc = useQueryClient()
  const { data: sug } = useQuery({
    queryKey: ["maturity-suggestion", hypothesisId],
    queryFn: () => hypApi.getMaturitySuggestion(hypothesisId),
  })

  const accept = useMutation({
    mutationFn: () => hypApi.acceptMaturitySuggestion(hypothesisId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hypotheses"] })
      qc.invalidateQueries({ queryKey: ["maturity-progress", hypothesisId] })  // уровень сменился — порог другой
      qc.invalidateQueries({ queryKey: ["maturity-suggestion", hypothesisId] })
    },
  })
  const dismiss = useMutation({
    mutationFn: () => hypApi.dismissMaturitySuggestion(hypothesisId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["maturity-suggestion", hypothesisId] }),
  })

  if (!sug) return null

  const up = sug.suggested_level > sug.current_level
  const color = up ? "#27AE60" : "#E74C3C"
  const Icon = up ? TrendingUp : TrendingDown
  const level = (i: number) => dt(MATURITY.levels[i]?.label ?? String(i))
  // числа есть — собираем текст через useT; нет (строка создана до появления колонок) — готовый reason
  const hasParts = sug.pred_signal != null && sug.obs_signal != null && sug.lab_signal != null
  const reasonText = hasParts
    ? t("maturityBanner.reason", {
        total: Number(sug.raw_signal).toFixed(2), pred: Number(sug.pred_signal).toFixed(2),
        obs: Number(sug.obs_signal).toFixed(2), lab: Number(sug.lab_signal).toFixed(2),
      })
    : sug.reason

  return (
    <section style={{
      display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: 12, padding: "12px 16px", borderRadius: 10,
      background: `${color}14`, border: `1px solid ${color}55`,
    }}>
      <Icon size={18} style={{ color: readableOn(color), flexShrink: 0, marginTop: 1 }} />
      <div style={{ flex: "1 1 260px", minWidth: 0 }}>
        <div style={{ fontSize: 14, color: theme.tx1, marginBottom: 4, lineHeight: 1.4 }}>
          {t(up ? "maturityBanner.raise" : "maturityBanner.lower", { from: level(sug.current_level), to: level(sug.suggested_level) })}
        </div>
        <div style={{ fontSize: 13, color: ink.label, lineHeight: 1.5 }}>{reasonText}</div>
      </div>
      <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
        <ActionButton size="sm" variant="primary" accent={color} icon={<Check size={14} />} disabled={accept.isPending} onClick={() => accept.mutate()}>
          {t("maturityBanner.accept")}
        </ActionButton>
        <ActionButton size="sm" icon={<X size={14} />} disabled={dismiss.isPending} onClick={() => dismiss.mutate()}>
          {t("maturityBanner.dismiss")}
        </ActionButton>
      </div>
    </section>
  )
}
