"use client"
// frontend/components/entities/visibility-tabs.tsx
//
// Главная, всегда видимая ось навигации по спискам сущностей — "где я
// сейчас смотрю", а не второстепенный фильтр. Раньше видимость пряталась
// внутри сворачиваемой панели "Фильтры" наравне со статусом, из-за чего
// личное/публичное/лабораторное визуально сливались в один список.
//
// В отличие от OrbitSelector (множественный выбор нескольких колец
// одновременно, используется как фильтр в паре с попапом), здесь —
// одиночный выбор, как в обычных табах: ровно один активный режим.
// "Лаборатория" при этом НЕ эксклюзивна по данным (см. entity-filters.ts —
// публичная запись из лабы попадёт и в "Публичное", и в "Лаборатория"),
// но как режим просмотра всегда выбран только один таб.
//
// Селектор конкретной лаборатории вынесен на ОТДЕЛЬНУЮ строку под табами
// (а не прицеплен в конец той же строки) — боковая панель узкая (~300px),
// и три таба + иконка + счётчик + выпадающий список лаборатории физически
// не помещались в одну линию, из-за чего последний таб обрезался.
import { useState, useRef, useEffect } from "react"
import { ChevronDown, Check } from "lucide-react"
import { VISIBILITY_LEVELS, type VisibilityValue } from "@/lib/visibility-levels"
import { useT } from "@/lib/i18n/useT"
import { ink, theme } from "@/lib/theme"

export type VisibilityTab = VisibilityValue

interface VisibilityTabsProps {
  active: VisibilityTab
  onChange: (v: VisibilityTab) => void
  counts: Record<VisibilityTab, number>
  labs?: { id: number; name: string }[]
  activeLabId?: number | null
  onLabChange?: (id: number | null) => void
  // Гость: вкладка "Личное" всегда пуста и бессмысленна для него (бэкенд
  // физически не отдаёт ему ничего личного) — скрываем целиком, а не
  // показываем как "0", чтобы не создавать ложное ожидание. "Лаборатория"
  // остаётся, но с уточнением — гость видит только публичные записи лабы.
  isGuest?: boolean
}

export function VisibilityTabs({ active, onChange, counts, labs, activeLabId, onLabChange, isGuest = false }: VisibilityTabsProps) {
  const t = useT()
  const [labMenuOpen, setLabMenuOpen] = useState(false)
  const labRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!labMenuOpen) return
    const onClick = (e: MouseEvent) => { if (labRef.current && !labRef.current.contains(e.target as Node)) setLabMenuOpen(false) }
    document.addEventListener("click", onClick)
    return () => document.removeEventListener("click", onClick)
  }, [labMenuOpen])

  const labels: Record<VisibilityTab, string> = {
    private: t("visibility.private"),
    lab: isGuest ? t("visibility.labGuestSuffix") : t("visibility.lab"),
    public: t("visibility.public"),
  }
  const visibleLevels = isGuest ? VISIBILITY_LEVELS.filter(l => l.value !== "private") : VISIBILITY_LEVELS

  return (
    <div style={{ padding: "6px 12px 0" }}>
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 2, borderBottom: `1px solid ${ink.line}` }}>
        {visibleLevels.map(level => {
          const isActive = active === level.value
          const Icon = level.icon
          const count = counts[level.value] ?? 0
          return (
            <button key={level.value} type="button" onClick={() => onChange(level.value)}
              aria-pressed={isActive}
              style={{
                display: "flex", alignItems: "center", gap: 6, minWidth: 0, marginBottom: -1,
                padding: "9px 10px", borderRadius: "8px 8px 0 0",
                border: "none", borderBottom: `2px solid ${isActive ? level.color : "transparent"}`,
                background: isActive ? level.color + "14" : "transparent",
                color: isActive ? level.color : ink.label,
                cursor: "pointer", fontSize: 13, fontWeight: isActive ? 600 : 500,
                transition: "all 0.15s", whiteSpace: "nowrap",
              }}>
              <Icon size={14} style={{ flexShrink: 0 }} />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{labels[level.value]}</span>
              <span style={{ fontSize: 11, fontFamily: theme.mono, flexShrink: 0, color: isActive ? level.color : ink.muted }}>
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Селектор конкретной лаборатории — своя строка, не конкурирует за
          ширину с табами. Показывается только когда активна вкладка "Лаборатория". */}
      {active === "lab" && labs && labs.length > 0 && onLabChange && (
        <div ref={labRef} style={{ position: "relative", marginTop: 8, marginBottom: 2 }}>
          <div onClick={() => setLabMenuOpen(o => !o)} style={{
            display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: ink.label,
            cursor: "pointer", padding: "6px 12px", borderRadius: 8, border: `1px solid ${ink.line}`,
            maxWidth: "100%",
          }}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {activeLabId ? labs.find(l => l.id === activeLabId)?.name ?? t("visibility.lab") : t("labs.allLabs")}
            </span>
            <ChevronDown size={12} style={{ flexShrink: 0 }} />
          </div>
          {labMenuOpen && (
            <div style={{
              position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 50,
              background: ink.card, border: `1px solid ${ink.line}`, borderRadius: 10, padding: 4,
              minWidth: 180, maxWidth: 280, boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
            }}>
              <div onClick={() => { onLabChange(null); setLabMenuOpen(false) }} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                fontSize: 13, padding: "8px 10px", borderRadius: 6, cursor: "pointer",
                color: activeLabId === null ? theme.tx1 : "#d6d9ec", background: activeLabId === null ? "#1e2236" : "transparent",
              }}>
                {t("labs.allLabs")}
                {activeLabId === null && <Check size={12} />}
              </div>
              {labs.map(l => (
                <div key={l.id} onClick={() => { onLabChange(l.id); setLabMenuOpen(false) }} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  fontSize: 13, padding: "8px 10px", borderRadius: 6, cursor: "pointer",
                  color: activeLabId === l.id ? theme.tx1 : "#d6d9ec", background: activeLabId === l.id ? "#1e2236" : "transparent",
                }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.name}</span>
                  {activeLabId === l.id && <Check size={12} style={{ flexShrink: 0, marginLeft: 6 }} />}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
