"use client"
import React from "react"
import { ink, theme } from "@/lib/theme"
import { readableOn } from "@/lib/color"
import { useIsMobile } from "@/lib/use-is-mobile"

export interface EntityTab {
  id: string
  label: string
  badge?: React.ReactNode
  /** Сколько связанных записей. 0 — вкладка приглушена; undefined — неизвестно, ничего не показываем. */
  count?: number
  /** тонкий вертикальный разделитель перед этой вкладкой — отделяет "чужие" вкладки (лабы) от собственных */
  dividerBefore?: boolean
}

interface EntityTabsProps {
  tabs: EntityTab[]
  activeTab: string
  onTabChange: (id: string) => void
  accent: string
}

const TEXT = "#c3c8e0"   // обычная вкладка: читаема на любом фоне страницы (контраст около 11:1)

// minWidth:0 нужен, чтобы flex-контейнер сжимался уже своего содержимого и срабатывал
// overflowX:auto — иначе на мобильном вкладки обрезались, а не скроллились.
// Пустая вкладка приглушается цветом, а не opacity: прозрачность роняет контраст текста ниже читаемого.
export function EntityTabs({ tabs, activeTab, onTabChange, accent }: EntityTabsProps) {
  const isMobile = useIsMobile()
  const accentText = readableOn(accent)
  return (
    <div role="tablist" className="entity-tabs-scroll" style={{
      display: "flex", alignItems: "flex-end", gap: 2, overflowX: "auto", overflowY: "hidden", minWidth: 0,
      WebkitOverflowScrolling: "touch", touchAction: "pan-x",
    }}>
      {tabs.map(({ id, label, badge, count, dividerBefore }) => {
        const isActive = activeTab === id
        const empty = count === 0
        const idle = empty ? ink.muted : TEXT
        return (
          <React.Fragment key={id}>
            {dividerBefore && <span style={{ width: 1, height: 20, background: "#262b42", margin: "0 6px 12px", flexShrink: 0 }} />}
            <button
              role="tab" aria-selected={isActive} onClick={() => onTabChange(id)}
              onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = "#ffffff0d"; e.currentTarget.style.color = theme.tx1 } }}
              onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = idle } }}
              style={{
                display: "flex", alignItems: "center", gap: 8, flexShrink: 0, whiteSpace: "nowrap",
                minHeight: isMobile ? 46 : 42, padding: isMobile ? "0 14px" : "0 16px",
                fontSize: 14, fontWeight: isActive ? 600 : 500, lineHeight: 1,
                color: isActive ? accentText : idle,
                background: isActive ? `${accent}1a` : "transparent",
                border: "none", borderBottom: `2px solid ${isActive ? accent : "transparent"}`,
                borderRadius: "8px 8px 0 0", marginBottom: -1, cursor: "pointer",
                transition: "color 0.12s, background 0.12s",
              }}
            >
              {label}{badge}
              {count != null && count > 0 && (
                <span style={{
                  fontFamily: theme.mono, fontSize: 11, lineHeight: 1, padding: "3px 6px", borderRadius: 6,
                  background: isActive ? `${accent}33` : "#ffffff14", color: isActive ? accentText : ink.label,
                }}>
                  {count}
                </span>
              )}
            </button>
          </React.Fragment>
        )
      })}
    </div>
  )
}
