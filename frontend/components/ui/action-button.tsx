"use client"
import React, { useState } from "react"
import { useIsMobile } from "@/lib/use-is-mobile"

const EDGE = "#3a4062"

export interface ActionButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** primary — главное действие страницы (одно на экран), secondary — остальные */
  variant?: "primary" | "secondary"
  size?: "sm" | "md"
  accent?: string
  icon?: React.ReactNode
}

// forwardRef и проброс остальных пропсов нужны, чтобы кнопка работала как триггер Radix (asChild).
export const ActionButton = React.forwardRef<HTMLButtonElement, ActionButtonProps>(function ActionButton(
  { variant = "secondary", size = "md", accent = "#4A90D9", icon, children, style, disabled, type = "button", onMouseEnter, onMouseLeave, ...rest },
  ref,
) {
  const isMobile = useIsMobile()
  const [hover, setHover] = useState(false)
  const primary = variant === "primary"
  const small = size === "sm" && !isMobile
  return (
    <button
      ref={ref} type={type} disabled={disabled}
      onMouseEnter={e => { setHover(true); onMouseEnter?.(e) }}
      onMouseLeave={e => { setHover(false); onMouseLeave?.(e) }}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
        minHeight: small ? 28 : isMobile ? 42 : 34,
        padding: small ? "4px 12px" : isMobile ? "10px 16px" : "7px 14px",
        fontSize: small ? 12 : 13, fontWeight: primary ? 600 : 500, lineHeight: 1.2, whiteSpace: "nowrap",
        borderRadius: 8, cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.55 : 1,
        border: `1px solid ${primary ? accent : EDGE}`,
        background: primary ? accent : hover && !disabled ? "#181b2c" : "transparent",
        color: primary ? "#0b0d14" : hover && !disabled ? "#f2efe9" : "#c9ccdd",
        filter: primary && hover && !disabled ? "brightness(1.1)" : undefined,
        transition: "background 0.12s, border-color 0.12s, color 0.12s",
        ...style,
      }}
      {...rest}
    >
      {icon}{children}
    </button>
  )
})
