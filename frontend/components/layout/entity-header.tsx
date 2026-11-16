"use client"
import React from "react"
import { theme } from "@/lib/theme"
import { useIsMobile } from "@/lib/use-is-mobile"
import { EntityTopStrip } from "@/components/layout/entity-top-strip"
import { EntityTabs } from "@/components/layout/entity-tabs"

export type { EntityTab } from "@/components/layout/entity-tabs"
import type { EntityTab } from "@/components/layout/entity-tabs"

interface EntityHeaderProps {
  accent: string
  icon?: React.ReactNode
  kicker?: string
  /** Полная строка даты, например "24 июня 2026" */
  dateStr?: string
  title: React.ReactNode
  tags?: React.ReactNode
  badges?: React.ReactNode
  actions?: React.ReactNode
  contextBar?: React.ReactNode
  tabs: EntityTab[]
  activeTab: string
  onTabChange: (id: string) => void
}

// Прежняя шапка (одна колонка). Новые страницы используют EntityPage; эта остаётся, пока на неё
// не переведены все шесть типов, после чего удаляется.
export function EntityHeader({
  accent, icon, kicker, dateStr, title, tags, badges, actions, contextBar, tabs, activeTab, onTabChange,
}: EntityHeaderProps) {
  const isMobile = useIsMobile()
  const padX = isMobile ? 16 : 24
  return (
    <div style={{ background: theme.bg1, flexShrink: 0, minWidth: 0 }}>
      <EntityTopStrip accent={accent} icon={icon} kicker={kicker} dateStr={dateStr} badges={badges} />

      <div style={{
        display: "flex", gap: 12, padding: isMobile ? "14px 16px 12px" : "18px 24px 14px",
        flexDirection: isMobile ? "column" : "row",
        alignItems: isMobile ? "stretch" : "flex-start", justifyContent: "space-between",
      }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h2 style={{
            fontSize: isMobile ? 20 : 24, fontWeight: 700, color: theme.tx1,
            lineHeight: 1.25, margin: 0, letterSpacing: "-0.02em", overflowWrap: "anywhere",
          }}>
            {title}
          </h2>
          {tags && <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>{tags}</div>}
        </div>
        {actions && (
          <div style={{
            display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, flexShrink: 0,
            justifyContent: isMobile ? "flex-start" : "flex-end", maxWidth: isMobile ? "100%" : "55%",
          }}>
            {actions}
          </div>
        )}
      </div>

      {contextBar && (
        <div style={{ padding: `0 ${padX}px 16px`, borderBottom: "1px solid #1E2236" }}>{contextBar}</div>
      )}

      <div style={{ borderTop: "1px solid #1E2236", padding: "0 8px", background: theme.bg1 }}>
        <EntityTabs tabs={tabs} activeTab={activeTab} onTabChange={onTabChange} accent={accent} />
      </div>
    </div>
  )
}
