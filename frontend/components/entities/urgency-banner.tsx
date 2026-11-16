"use client"
import React from "react"
import { ink, theme } from "@/lib/theme"
import { readableOn } from "@/lib/color"
import { ActionButton } from "@/components/ui/action-button"

export interface UrgencyBannerProps {
  /** цвет смысла: красный — просрочено, янтарный — скоро, зелёный — готово */
  tone: string
  icon: React.ReactNode
  title: string
  description?: string
  action?: { label: string; onClick: () => void; icon?: React.ReactNode; primary?: boolean }
}

/** Плашка срочности над вкладками: что происходит, что с этим делать и кнопка, которая это делает. */
export function UrgencyBanner({ tone, icon, title, description, action }: UrgencyBannerProps) {
  return (
    <section role="status" style={{
      display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, padding: "12px 14px", boxSizing: "border-box",
      borderRadius: 12, background: `${tone}12`, border: `1px solid ${tone}40`,
    }}>
      <span aria-hidden style={{ width: 28, height: 28, borderRadius: 8, background: `${tone}24`, color: readableOn(tone), display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {icon}
      </span>
      <div style={{ flex: "1 1 240px", minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.4, color: theme.tx1 }}>{title}</div>
        {description && <div style={{ fontSize: 13, lineHeight: 1.5, color: ink.muted, marginTop: 2 }}>{description}</div>}
      </div>
      {action && (
        <ActionButton size="sm" variant={action.primary ? "primary" : undefined} accent={tone} icon={action.icon} onClick={action.onClick}>
          {action.label}
        </ActionButton>
      )}
    </section>
  )
}
