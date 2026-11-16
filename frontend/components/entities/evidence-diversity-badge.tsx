"use client"
import { useQuery } from "@tanstack/react-query"
import { hypApi } from "@/lib/api"
import { useT } from "@/lib/i18n/useT"
import { AlertTriangle, RefreshCw } from "lucide-react"

interface EvidenceDiversityBadgeProps {
  hypothesisId: number
}

/**
 * Самостоятельный useQuery по entityId — тот же паттерн, что уже
 * используется в MaturitySuggestionBanner/ReflectionNudge/ContradictionNudge.
 * НЕ читает данные из объекта гипотезы, полученного из списка (см. баг:
 * страница гипотезы получает данные из закэшированного list_hyps через
 * useEntityUrlSync, минуя единичный GET почти всегда — поле в HypOut
 * никогда бы не долетало до фронтенда).
 *
 * Показывает предупреждение только когда есть что сказать — если ни одна
 * из сторон не флагована, компонент рендерит null.
 *
 * АСИММЕТРИЯ confirming/refuting — намеренная (см. обсуждение в чате,
 * Поппер: для confirming нужна широкая база, для refuting достаточно
 * одного надёжного случая). Формулировки принципиально разные.
 *
 * НИКОГДА не показываем конкретные числа/пороги/механику эмбеддингов —
 * только смысл.
 */
export function EvidenceDiversityBadge({ hypothesisId }: EvidenceDiversityBadgeProps) {
  const t = useT()
  const { data: diversity } = useQuery({
    queryKey: ["evidence-diversity", hypothesisId],
    queryFn: () => hypApi.evidenceDiversity(hypothesisId),
  })

  if (!diversity) return null
  const { confirming, refuting } = diversity
  if (!confirming.warning && !refuting.warning) return null

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {confirming.warning && (
        <div style={{
          display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 14px", borderRadius: 8,
          background: "#E7A33C10", border: "1px solid #E7A33C30",
        }}>
          <AlertTriangle size={14} style={{ color: "#E7A33C", flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 12, color: "#E7A33C", lineHeight: 1.5 }}>
            {t("evidenceDiversity.confirmingWarning")}
          </span>
        </div>
      )}
      {refuting.warning && (
        <div style={{
          display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 14px", borderRadius: 8,
          background: "#E74C3C10", border: "1px solid #E74C3C30",
        }}>
          <RefreshCw size={14} style={{ color: "#E74C3C", flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 12, color: "#E74C3C", lineHeight: 1.5 }}>
            {t("evidenceDiversity.refutingWarning")}
          </span>
        </div>
      )}
    </div>
  )
}
