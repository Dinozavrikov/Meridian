"use client"
import React from "react"
import { ink } from "@/lib/theme"

interface SquareIconButtonProps {
  /** подпись для скринридера и подсказки: видимого текста у кнопки нет */
  label: string
  icon: React.ReactNode
  onClick: () => void
  size?: number
}

/** Квадратная кнопка только с иконкой: для тесных мест (узкий блок, телефон), где текстовая не помещается. */
export function SquareIconButton({ label, icon, onClick, size = 36 }: SquareIconButtonProps) {
  const [hover, setHover] = React.useState(false)
  return (
    <button
      type="button" aria-label={label} title={label} onClick={onClick}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        width: size, height: size, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
        borderRadius: 8, cursor: "pointer", transition: "all 0.12s",
        background: hover ? "#181b2c" : ink.well, border: `1px solid ${hover ? ink.label : ink.line}`, color: hover ? "#e0e3f5" : ink.label,
      }}
    >
      {icon}
    </button>
  )
}
