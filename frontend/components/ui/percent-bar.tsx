"use client"
import React from "react"

interface PercentBarProps {
  label: string
  value: number
  max?: number
  color: string
}

/**
 * Непрерывная процентная полоса для шкал 0-100 (прогресс, уверенность).
 * В отличие от ScaleControl (дискретные сегменты), здесь одна плавная заливка.
 */
export function PercentBar({ label, value, max = 100, color }: PercentBarProps) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  return (
    <div style={{ minWidth: 0, width: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#9295a5" }}>{label}</span>
        <span style={{ fontSize: 9, color, fontWeight: 600 }}>{value}%</span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 3, transition: "width 0.2s" }} />
      </div>
    </div>
  )
}
