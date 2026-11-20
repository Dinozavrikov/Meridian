"use client"
import { useState } from "react"
import { OrbitSelector, VisibilityValue } from "@/components/ui/orbit-selector"
import { useDynamicTranslate } from "@/lib/i18n/useDynamicT"
import { useT } from "@/lib/i18n/useT"

interface ListFiltersProps {
  statuses: string[]
  activeStatuses: Record<string, boolean>
  onToggleStatus: (s: string) => void
  accent: string
  showVisibility?: boolean
  activeVisibility?: VisibilityValue[]
  onVisibilityChange?: (v: VisibilityValue[]) => void
  labs?: { id: number; name: string }[]
  activeLabId?: number | null
  onLabChange?: (id: number | null) => void
}

/**
 * Единый блок «Фильтры» для списков сущностей: сворачиваемые чекбоксы
 * по статусу + (опционально) OrbitSelector по видимости/лаборатории.
 * Используется на одном и том же месте (после поиска, перед списком)
 * во всех разделах: Гипотезы, Наблюдения, Прогнозы, Убеждения, Вопросы, Задачи.
 *
 * Список статусов приходит снаружи и переводится динамически (без
 * привязки к конкретным значениям) — работает при любом наборе статусов.
 */
export function ListFilters({
  statuses, activeStatuses, onToggleStatus, accent,
  showVisibility = true, activeVisibility = [], onVisibilityChange,
  labs, activeLabId, onLabChange,
}: ListFiltersProps) {
  const [open, setOpen] = useState(false)
  const t = useT()
  const dt = useDynamicTranslate(statuses, { noYo: true })
  const activeStatusCount = Object.values(activeStatuses).filter(Boolean).length
  const totalActive = activeStatusCount + (showVisibility ? activeVisibility.length : 0)

  return (
    <div style={{ padding: "10px 16px 6px" }}>
      <div onClick={() => setOpen(o => !o)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: "#9aa1c2", letterSpacing: "0.08em", textTransform: "uppercase" }}>
          {t("filters.label")}{totalActive > 0 ? ` (${totalActive})` : ""}
        </span>
        <span style={{ fontSize: 12, color: "#9aa1c2", transform: open ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.15s" }}>▾</span>
      </div>
      <div style={{
        display: "grid",
        gridTemplateRows: open ? "1fr" : "0fr",
        transition: "grid-template-rows 0.22s cubic-bezier(0.4, 0, 0.2, 1)",
      }}>
        <div style={{ overflow: "hidden" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 1, marginTop: 6, opacity: open ? 1 : 0, transition: "opacity 0.18s ease" }}>
            {statuses.map(s => {
              const on = !!activeStatuses[s]
              return (
                <div key={s} onClick={() => onToggleStatus(s)}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 4px", borderRadius: 6, cursor: "pointer" }}>
                  <div style={{ width: 16, height: 16, borderRadius: 4, border: `1px solid ${on ? accent : "#4a5178"}`, background: on ? accent : "transparent", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", transition: "background 0.12s, border-color 0.12s" }}>
                    {on && <span style={{ fontSize: 11, color: "#0D0F1E", fontWeight: 700 }}>✓</span>}
                  </div>
                  <span style={{ fontSize: 13, color: on ? "#e2e0db" : "#c3c8e0", transition: "color 0.12s" }}>{dt(s)}</span>
                </div>
              )
            })}
            {showVisibility && onVisibilityChange && (
              <>
                <div style={{ height: 1, background: "#111120", margin: "8px 4px" }} />
                <div style={{ padding: "2px 4px 4px" }}>
                  <OrbitSelector
                    active={activeVisibility}
                    onChange={onVisibilityChange}
                    labs={labs}
                    activeLabId={activeLabId}
                    onLabChange={onLabChange}
                    size={36}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
