"use client"
import { ReactNode } from "react"

interface PillButtonProps {
  onClick: () => void
  children: ReactNode
  disabled?: boolean
}

/**
 * Обобщённый стиль вторичной кнопки-действия — вынесен из исходного
 * EditFactorsButton (Predictions/Worldview), чтобы не дублировать инлайн-стиль
 * в каждом новом месте (см. ContradictionNudge). EditFactorsButton далее
 * переведён на этот компонент как первый потребитель.
 */
export function PillButton({ onClick, children, disabled }: PillButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8,
        fontSize: 12, fontWeight: 600, cursor: disabled ? "default" : "pointer", alignSelf: "flex-start",
        background: "transparent", color: "#9999ad", border: "1px solid #242430",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  )
}
