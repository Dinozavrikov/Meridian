"use client"

import { DEFAULT_SCALES, translateScale, type Scale } from "@/lib/scales"
import { Ruler } from "@/components/ui/ruler"
import { useDynamicTranslate } from "@/lib/i18n/useDynamicT"
import { collectStrings } from "@/lib/i18n/collect-strings"

export interface ScalesGridProps {
  entityType: string
  values: Record<string, any>
  onChange?: (scaleId: string, value: number) => void
  scales?: Scale[]
  lockedIds?: Set<string>
  columns?: number
  size?: "sm" | "lg"
  className?: string
}

export function ScalesGrid({
  entityType,
  values,
  onChange,
  scales,
  lockedIds,
  columns = 2,
  size = "sm",
  className = "",
}: ScalesGridProps) {
  const dt = useDynamicTranslate(collectStrings(DEFAULT_SCALES))
  const rawList = scales ?? DEFAULT_SCALES.filter(s => s.entity_type === entityType)
  const list = rawList.map(s => translateScale(s, dt))

  if (list.length === 0) return null

  return (
    <div
      className={className}
      style={{ display: "grid", gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: 8 }}
    >
      {list.map(scale => {
        const locked = lockedIds?.has(scale.id) ?? false
        return (
          <div
            key={scale.id}
            title={locked ? dt("scales.lockedHint") : undefined}
            style={{ background: "#181B2C", border: "1px solid #1E2236", borderRadius: 6, padding: "7px 10px", minWidth: 0, opacity: locked ? 0.6 : 1 }}
          >
            <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#9295a5", marginBottom: 5 }}>
              {scale.name}
            </div>
            <Ruler
              name={scale.name}
              value={values[scale.id]}
              min={scale.min}
              max={scale.max}
              step={scale.step}
              color={scale.color}
              levels={scale.levels}
              size={size}
              onChange={onChange && !locked ? (v) => onChange(scale.id, v) : undefined}
            />
          </div>
        )
      })}
    </div>
  )
}
