"use client"
import React, { useState } from "react"
import { ChevronDown } from "lucide-react"
import { readableOn } from "@/lib/color"

export interface PillProps {
  /** оттенок бейджа (hex); без него — нейтральный серый */
  color?: string
  icon?: React.ReactNode
  /** цветная точка слева (для статусов) */
  dot?: boolean
  size?: "sm" | "md"
  /** стрелка справа: подсказывает, что бейдж открывает выбор */
  chevron?: boolean
  /** есть — бейдж кнопка, нет — просто метка */
  onClick?: () => void
  title?: string
  /** склейка с соседним сегментом: скругление только с одной стороны */
  join?: "left" | "right"
  children: React.ReactNode
}

// Один вид для всех бейджей. Цвет текста подбирается так, чтобы он читался на тёмном фоне:
// часть цветов статусов (#333333, #484848, #606060) в theme.ts иначе давала бы невидимый текст.
export function Pill({ color, icon, dot = false, size = "md", chevron = false, onClick, title, join, children }: PillProps) {
  const [hover, setHover] = useState(false)
  const md = size === "md"
  const text = color ? readableOn(color) : "#c9ccdd"
  const style: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: 6, boxSizing: "border-box", maxWidth: "100%",
    height: md ? 28 : 22, padding: md ? "0 10px" : "0 8px", borderRadius: join === "left" ? (md ? "8px 0 0 8px" : "6px 0 0 6px") : join === "right" ? (md ? "0 8px 8px 0" : "0 6px 6px 0") : md ? 8 : 6,
    marginLeft: join === "right" ? -1 : undefined,
    fontSize: md ? 13 : 12, fontWeight: 500, lineHeight: 1, whiteSpace: "nowrap",
    color: text,
    background: color ? `${color}1f` : "#181b2c",
    border: `1px solid ${color ? `${color}59` : "#262b42"}`,
    filter: onClick && hover ? "brightness(1.2)" : undefined,
    cursor: onClick ? "pointer" : "default",
    transition: "filter 0.12s",
  }
  const body = (
    <>
      {dot && <span aria-hidden style={{ width: 6, height: 6, borderRadius: "50%", background: text, flexShrink: 0 }} />}
      {icon}
      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{children}</span>
      {chevron && onClick && <ChevronDown size={12} aria-hidden style={{ flexShrink: 0, opacity: 0.8 }} />}
    </>
  )
  return onClick ? (
    <button type="button" title={title} onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} style={style}>
      {body}
    </button>
  ) : (
    <span title={title} style={style}>{body}</span>
  )
}
