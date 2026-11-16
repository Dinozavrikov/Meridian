"use client"
// frontend/components/entities/locked-target-chip.tsx
//
// Read-only "чип" зафиксированного родителя в quick-create формах —
// показывает, к чему привязывается создаваемая сущность, без возможности
// сменить. Вынесен из add-forecast-modal.tsx для переиспользования в
// quick-create формах Observation/Worldview/Task/Question.
import type { LucideIcon } from "lucide-react"
import { Lock } from "lucide-react"

interface LockedTargetChipProps {
  label: string
  value: string
  icon: LucideIcon
  accent?: string
}

export function LockedTargetChip({ label, value, icon: Icon, accent = "#4A90D9" }: LockedTargetChipProps) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 12, color: "#9393b5", marginBottom: 6 }}>
        {label}
      </label>
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "9px 12px", borderRadius: 8,
        background: "#12121c", border: "1px solid #1e1e2c",
        color: "#9090b8", fontSize: 13,
      }}>
        <Icon size={13} style={{ color: accent, flexShrink: 0 }} />
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {value}
        </span>
        <Lock size={12} style={{ color: "#9696a7", flexShrink: 0 }} />
      </div>
    </div>
  )
}
