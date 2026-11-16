"use client"
import { askConfirmText } from "@/lib/confirm"
import { useState } from "react"
import { Pencil, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { entityCard, filterBtn, glowStyle } from "@/lib/theme"

interface EntityListProps {
  items: any[]
  isLoading?: boolean
  accentColor?: string
  filters?: { value: string; label: string }[]
  filterKey?: string
  onEdit?: (item: any) => void
  onDelete?: (item: any) => void
  deleteConfirm?: string
  emptyIcon?: React.ReactNode
  emptyText?: string
  emptyHint?: string
  renderTitle: (item: any) => React.ReactNode
  renderMeta?: (item: any) => React.ReactNode
  renderExtra?: (item: any) => React.ReactNode
  getAccent?: (item: any) => string
}

export function EntityList({
  items, isLoading, accentColor = "#4A90D9",
  filters, filterKey = "status",
  onEdit, onDelete, deleteConfirm = "Удалить?",
  emptyIcon, emptyText = "Нет данных", emptyHint,
  renderTitle, renderMeta, renderExtra, getAccent,
}: EntityListProps) {
  const [filter, setFilter] = useState("")
  const [hovered, setHovered] = useState<number | null>(null)
  const filtered = filter ? items.filter(i => i[filterKey] === filter) : items

  return (
    <div>
      {/* фильтры */}
      {filters && (
        <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
          <button onClick={() => setFilter("")} style={filterBtn(!filter, accentColor)}>Все</button>
          {filters.map(f => (
            <button key={f.value} onClick={() => setFilter(f.value === filter ? "" : f.value)}
              style={filterBtn(filter === f.value, accentColor)}>
              {f.label}
            </button>
          ))}
        </div>
      )}

      {/* скелетон */}
      {isLoading && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {[...Array(5)].map((_, i) => (
            <div key={i} style={{
              height: 64, borderRadius: 10, borderLeft: `3px solid ${accentColor}30`,
              background: "#111", border: "1px solid #1a1a1a", opacity: 0.5 - i * 0.08,
            }} />
          ))}
        </div>
      )}

      {/* пусто */}
      {!isLoading && filtered.length === 0 && (
        <div style={{ textAlign: "center", padding: "80px 0", color: "#9b9b9b" }}>
          {emptyIcon && <div style={{ marginBottom: 12, opacity: 0.4 }}>{emptyIcon}</div>}
          <p style={{ fontSize: 14, color: "#969696" }}>{emptyText}</p>
          {emptyHint && <p style={{ fontSize: 12, color: "#9b9b9b", marginTop: 4 }}>{emptyHint}</p>}
        </div>
      )}

      {/* список */}
      {!isLoading && filtered.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {filtered.map(item => {
            const accent = getAccent ? getAccent(item) : accentColor
            const isHov = hovered === item.id
            return (
              <div key={item.id}
                style={{ ...entityCard(accent, isHov), ...(isHov ? glowStyle(accent) : {}) }}
                onMouseEnter={() => setHovered(item.id)}
                onMouseLeave={() => setHovered(null)}
              >
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* мета-строка */}
                    {renderMeta && (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5, flexWrap: "wrap" }}>
                        {renderMeta(item)}
                      </div>
                    )}
                    {/* заголовок */}
                    <div style={{ fontSize: 14, fontWeight: 500, color: "#ddd", lineHeight: 1.4 }}>
                      {renderTitle(item)}
                    </div>
                    {/* доп. контент */}
                    {renderExtra && (
                      <div style={{ marginTop: 6 }}>
                        {renderExtra(item)}
                      </div>
                    )}
                  </div>
                  {/* действия */}
                  <div style={{
                    display: "flex", gap: 2, flexShrink: 0,
                    opacity: isHov ? 1 : 0, transition: "opacity 0.15s",
                  }}>
                    {onEdit && (
                      <button onClick={() => onEdit(item)}
                        style={{ padding: "4px 7px", borderRadius: 6, border: "none", background: "transparent", color: "#9a9a9a", cursor: "pointer" }}
                        onMouseEnter={e => (e.currentTarget.style.color = "#e0e0e0")}
                        onMouseLeave={e => (e.currentTarget.style.color = "#999999")}>
                        <Pencil size={13} />
                      </button>
                    )}
                    {onDelete && (
                      <button onClick={async () => { if (await askConfirmText(deleteConfirm)) onDelete(item) }}
                        style={{ padding: "4px 7px", borderRadius: 6, border: "none", background: "transparent", color: "#9a9a9a", cursor: "pointer" }}
                        onMouseEnter={e => (e.currentTarget.style.color = "#E74C3C")}
                        onMouseLeave={e => (e.currentTarget.style.color = "#999999")}>
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
