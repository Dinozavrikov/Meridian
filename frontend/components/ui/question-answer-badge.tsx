"use client"
import React from "react"
import { Lightbulb } from "lucide-react"
import { v2 } from "@/lib/theme"
export function QuestionAnswerBadge({ count = 1 }: { count?: number }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 3,
      minWidth: 16, height: 16, padding: "0 5px", borderRadius: 8,
      background: v2.amber, color: v2.bg, fontSize: 9, fontWeight: 700,
      flexShrink: 0,
    }}>
      <Lightbulb size={10} style={{ flexShrink: 0 }} />
      {count > 1 ? (count > 9 ? "9+" : count) : null}
    </span>
  )
}
