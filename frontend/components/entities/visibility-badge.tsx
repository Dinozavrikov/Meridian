"use client"
import { getVisibilityOptions } from "@/lib/visibility-levels"
import { useT } from "@/lib/i18n/useT"
import { Pill } from "@/components/ui/pill"

interface VisibilityBadgeProps {
  visibility: string
  // Акцент страницы — красит "лаборатория" в её фирменный цвет (как в
  // остальных чипах этого раздела); "публичное"/"личное" цвет фиксирован.
  labColor?: string
  // Если передан — бейдж кликабелен (например, открывает модалку публикации
  // для владельца записи). Без onClick — просто статичный индикатор.
  onClick?: () => void
  // Склейка с соседним сегментом (доступ через связи): см. Pill
  join?: "left" | "right"
}

// Единый цветной индикатор видимости сущности — переиспользуется в шапке
// детального просмотра любой сущности (Observation/Hypothesis/Prediction/
// Worldview/Question/Task), чтобы не расходиться в стилях между разделами:
// у каждого уровня свой цвет, вид один (Pill, как и у статуса).
export function VisibilityBadge({ visibility, labColor, onClick, join }: VisibilityBadgeProps) {
  const t = useT()
  const vis = getVisibilityOptions(t, labColor).find(v => v.value === visibility)
  if (!vis) return null
  const Icon = vis.icon
  return (
    <Pill color={vis.color} icon={<Icon size={14} />} onClick={onClick} join={join} chevron={!!onClick} title={onClick ? vis.label : undefined}>
      {vis.label}
    </Pill>
  )
}
