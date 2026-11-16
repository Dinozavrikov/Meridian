"use client"
import React from "react"
import { formatEntityStamp } from "@/lib/theme"

interface DateStampProps {
  /** ISO-строка (created_at) или "YYYY-MM-DD" */
  raw?: string
}

/**
 * Штамп даты/времени Меридиана: "21 июн │ 14:32".
 * День — вторичный текст, время — моноширинное и чуть ярче. Единый подпись сущности во всех списках.
 */
export function DateStamp({ raw }: DateStampProps) {
  const stamp = formatEntityStamp(raw)
  if (!stamp) return null
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12 }}>
      <span style={{ color: "#9aa1c2", letterSpacing: "0.02em" }}>{stamp.day}</span>
      <span aria-hidden style={{ width: 1, height: 11, background: "#323855" }} />
      <span style={{ fontFamily: "'JetBrains Mono', 'Fira Code', monospace", color: "#b4b9d2", letterSpacing: "0.02em", fontWeight: 600 }}>{stamp.time}</span>
    </span>
  )
}
