"use client"
import { useDynamicTranslate } from "@/lib/i18n/useDynamicT"
import { collectStrings } from "@/lib/i18n/collect-strings"
import { DEFAULT_SCALES, type ScaleLevel } from "@/lib/scales"
import { levelFor } from "@/lib/use-scale-track"
import { readableOn } from "@/lib/color"

interface MiniScaleProps {
  name: string
  value: number
  min: number
  max: number
  color: string
  step?: number
  levels?: ScaleLevel[]
}

/** Показатель шкалы для строки списка: название уровня и ряд делений. Рисуется только для оценённых
 *  значений — «не оценено» в списке не показываем вовсе, а не рисуем пустую линейку. */
export function MiniScale({ name, value, min, max, color, step = 1, levels }: MiniScaleProps) {
  const dt = useDynamicTranslate(collectStrings(DEFAULT_SCALES))
  const count = Math.max(1, Math.round((max - min) / step))
  const level = levelFor(levels, value)
  const text = level ? dt(level.label) : `${value}/${max}`
  return (
    <div role="img" aria-label={`${name}: ${text}`} style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
      <span style={{ fontSize: 12, fontWeight: 500, color: readableOn(color), whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>
        {text}
      </span>
      <span aria-hidden style={{ display: "flex", gap: 2, flex: "0 0 auto" }}>
        {Array.from({ length: count + 1 }).map((_, i) => (
          <span key={i} data-on={min + i * step <= value ? "1" : "0"}
            style={{ width: 10, height: 4, borderRadius: 2, background: min + i * step <= value ? color : "#2a2f4a" }} />
        ))}
      </span>
    </div>
  )
}
