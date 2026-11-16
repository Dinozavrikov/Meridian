"use client"
import React from "react"
import { v2 } from "@/lib/theme"

/**
 * Бейдж для стартовых онбординговых гипотез/прогнозов ("Попробуй сейчас").
 * Использует тот же паттерн, что StatusBadge — точка-маркер + текст.
 */
export function OnboardingBadge({ fontSize = 10 }: { fontSize?: number }) {
  const c = v2.amber
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      fontSize, padding: "2px 7px", borderRadius: 4,
      background: c + "18", color: c,
      border: `1px solid ${c}30`,
      fontWeight: 600, letterSpacing: "0.02em",
      whiteSpace: "nowrap", flexShrink: 0,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: c, flexShrink: 0, display: "inline-block" }} />
      Попробуй сейчас
    </span>
  )
}
