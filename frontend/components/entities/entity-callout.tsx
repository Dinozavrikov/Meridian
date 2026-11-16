"use client"
import React from "react"
import Link from "next/link"
import { ArrowUpRight } from "lucide-react"
import { ink, theme } from "@/lib/theme"
import { readableOn } from "@/lib/color"

interface EntityCalloutProps {
  /** цвет смысла блока, а не типа записи: зелёный «за», красный «против», синий «связано» */
  tone: string
  icon: React.ReactNode
  title: string
  /** есть: заголовок врезки — ссылка на связанную запись */
  href?: string
  /** действие в правом углу шапки (например «Изменить»): у всех врезок оно на одном месте */
  action?: React.ReactNode
  children: React.ReactNode
}

/**
 * Врезка на странице сущности: иконка в цветной плашке, заголовок, действие, текст. Один вид для «Основания»,
 * «Итог» и «Гипотеза» прогноза, «Ответ» вопроса: раньше у каждого была своя рамка со стрелкой слева.
 */
export function EntityCallout({ tone, icon, title, href, action, children }: EntityCalloutProps) {
  return (
    <section aria-label={title} style={{ minWidth: 0, boxSizing: "border-box", background: ink.card, border: `1px solid ${ink.line}`, borderRadius: 12, padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, minHeight: 30, flexWrap: "wrap" }}>
        <span aria-hidden style={{ width: 28, height: 28, borderRadius: 8, background: `${tone}1f`, color: readableOn(tone), display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          {icon}
        </span>
        <h4 style={{ margin: 0, flex: "1 1 8rem", minWidth: 0, fontSize: 14, fontWeight: 600, color: theme.tx1 }}>
          {href ? (
            <Link href={href} style={{ color: "inherit", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}>
              {title}<ArrowUpRight size={14} aria-hidden style={{ color: ink.muted }} />
            </Link>
          ) : title}
        </h4>
        {action && <span style={{ marginLeft: "auto" }}>{action}</span>}
      </div>
      <div style={{ fontSize: 14, lineHeight: 1.65, color: "#d6d9ec", overflowWrap: "anywhere" }}>{children}</div>
    </section>
  )
}
