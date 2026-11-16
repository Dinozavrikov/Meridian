"use client"
import { v2 } from "@/lib/theme"

interface ToggleProps {
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}

export function Toggle({ checked, onChange, disabled }: ToggleProps) {
  return (
    <div
      role="switch"
      aria-checked={checked}
      onClick={() => !disabled && onChange(!checked)}
      style={{
        width: 36, height: 20, borderRadius: 10, position: "relative", flexShrink: 0,
        cursor: disabled ? "default" : "pointer",
        background: checked ? v2.teal : "rgba(255,255,255,0.1)",
        opacity: disabled ? 0.5 : 1,
        transition: "background 0.15s",
      }}
    >
      <div style={{
        position: "absolute", top: 2,
        left: checked ? 18 : 2,
        width: 16, height: 16, borderRadius: "50%", background: v2.bg,
        transition: "left 0.15s",
      }} />
    </div>
  )
}
