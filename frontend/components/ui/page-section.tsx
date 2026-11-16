"use client"
import type { ReactNode } from "react"
import { v2 } from "@/lib/theme"
import { pad2 } from "@/lib/roadmap"

/** Раздел длинной страницы: номер, заголовок, вводная строка и содержимое. id служит якорем для оглавления. */
export function PageSection({ id, index, title, lead, children }: { id: string; index: number; title: string; lead: string; children: ReactNode }) {
  return (
    <section id={id} className="docs-sec" style={{ padding: "56px 0 8px" }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ marginBottom: 10, fontSize: 12, fontWeight: 600, letterSpacing: "0.16em", color: v2.teal }}>{pad2(index + 1)}</div>
        <h2 style={{ margin: "0 0 10px", fontSize: 28, fontWeight: 600, letterSpacing: "-0.02em", color: v2.t1 }}>{title}</h2>
        <p style={{ margin: 0, maxWidth: 720, fontSize: 15, lineHeight: 1.65, color: v2.t3 }}>{lead}</p>
      </div>
      {children}
    </section>
  )
}
