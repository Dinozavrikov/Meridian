"use client"
import { useState, useEffect } from "react"
import { useQueries } from "@tanstack/react-query"
import { hypApi } from "@/lib/api"
import { useT } from "@/lib/i18n/useT"
import { TrendingUp, TrendingDown, Check } from "lucide-react"

const DEBOUNCE_MS = 500

/**
 * Живой отклик прямо в форме создания/редактирования гипотезы: пока
 * пользователь печатает теги, для каждого завершённого тега (через запятую)
 * подтягивается личная история — сколько прогнозов в этой теме закрыто и
 * есть ли системный перекос между уверенностью и фактом (см. обсуждение
 * "личного базового уровня" в чате).
 *
 * Не диагноз и не совет — просто зеркало собственной истории пользователя.
 * Молчит полностью, если данных недостаточно (см. MIN_TAG_CALIBRATION_N
 * на бэкенде) — тишина здесь так же осмысленна, как и в EvidenceDiversityBadge.
 */
export function TagCalibrationHint({ tagsRaw }: { tagsRaw: string }) {
  const t = useT()
  const [debounced, setDebounced] = useState(tagsRaw)

  useEffect(() => {
    const id = setTimeout(() => setDebounced(tagsRaw), DEBOUNCE_MS)
    return () => clearTimeout(id)
  }, [tagsRaw])

  const tags = Array.from(new Set(
    debounced.split(",").map(s => s.trim().toLowerCase()).filter(Boolean)
  ))

  const results = useQueries({
    queries: tags.map(tag => ({
      queryKey: ["tag-calibration", tag],
      queryFn: () => hypApi.tagCalibration(tag),
      enabled: tag.length > 0,
      staleTime: 5 * 60 * 1000,
    })),
  })

  const hints = results
    .map(r => r.data)
    .filter((d): d is NonNullable<typeof d> => !!d)

  if (hints.length === 0) return null

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {hints.map(h => {
        const Icon = h.bias === "over" ? TrendingDown : h.bias === "under" ? TrendingUp : Check
        const color = h.bias === "over" ? "#E7A33C" : h.bias === "under" ? "#4A90D9" : "#27AE60"
        return (
          <div key={h.tag} style={{
            display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 12px", borderRadius: 7,
            background: `${color}10`, border: `1px solid ${color}28`,
          }}>
            <Icon size={13} style={{ color, flexShrink: 0, marginTop: 1 }} />
            <span style={{ fontSize: 11.5, color: "#a0a0b8", lineHeight: 1.5 }}>
              {t(`tagCalibration.${h.bias}`, {
                tag: h.tag, n: h.n_closed, confirmed: h.confirmed_count,
                avgConf: h.avg_confidence_pct, actual: h.actual_rate_pct,
              })}
            </span>
          </div>
        )
      })}
    </div>
  )
}
