"use client"
import React from "react"
import { ink, theme } from "@/lib/theme"
import { useIsMobile } from "@/lib/use-is-mobile"

/** Форматирует dateStr в { date: "24 ИЮНЯ 2026", time: "02 / 14" } если строка содержит " · " */
export function parseDateStr(dateStr?: string): { date: string; time?: string } {
  if (!dateStr) return { date: "" }
  const parts = dateStr.split(" · ")
  if (parts.length === 2) return { date: parts[0].toUpperCase(), time: parts[1] }
  return { date: dateStr.toUpperCase() }
}

const cell: React.CSSProperties = {
  display: "flex", alignItems: "center", padding: "0 14px", height: "100%",
  borderRight: "1px solid #1E2236", flexShrink: 0,
}

interface EntityTopStripProps {
  accent: string
  icon?: React.ReactNode
  kicker?: string
  dateStr?: string
  badges?: React.ReactNode
}

/** Верхняя полоса: цветная метка типа, тип, дата и время (и, при наличии, бейджи справа). */
export function EntityTopStrip({ accent, icon, kicker, dateStr, badges }: EntityTopStripProps) {
  const { date, time } = parseDateStr(dateStr)
  const isMobile = useIsMobile()
  return (
    <div style={{
      display: "flex", alignItems: "center", flexWrap: "wrap", flexShrink: 0,
      minHeight: 44, borderBottom: "1px solid #1E2236", position: "relative",
    }}>
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: accent }} />
      {(icon || kicker) && (
        <div style={{ ...cell, paddingLeft: 20, gap: 8 }}>
          {icon && <span style={{ color: accent, display: "flex", alignItems: "center" }}>{icon}</span>}
          {kicker && (
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: accent, whiteSpace: "nowrap" }}>
              {kicker}
            </span>
          )}
        </div>
      )}
      {date && (
        <div className="entity-header-date" style={cell}>
          <span style={{ fontSize: 12, fontWeight: 600, color: ink.label, letterSpacing: "0.04em", whiteSpace: "nowrap" }}>{date}</span>
        </div>
      )}
      {time && (
        <div className="entity-header-time" style={cell}>
          <span style={{ fontFamily: theme.mono, fontSize: 13, color: ink.label, letterSpacing: "0.04em", whiteSpace: "nowrap", fontWeight: 600 }}>{time}</span>
        </div>
      )}
      <div style={{ flex: 1 }} />
      {badges && (
        <div style={{
          display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6, padding: "6px 16px",
          borderLeft: isMobile ? "none" : "1px solid #1E2236",
        }}>
          {badges}
        </div>
      )}
    </div>
  )
}
