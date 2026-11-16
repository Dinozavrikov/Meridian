"use client"
import type { CSSProperties, ReactNode } from "react"
import { v2 } from "@/lib/theme"
import { useIsMobile } from "@/lib/use-is-mobile"
import { body, card, eyebrow, h3 } from "@/components/docs/docs-style"

const th: CSSProperties = { padding: "10px 14px", textAlign: "left", fontSize: 12, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: v2.t4, borderBottom: `1px solid ${v2.bd2}` }
const td: CSSProperties = { padding: "14px", borderBottom: `1px solid ${v2.bd}`, color: v2.t3, fontSize: 14, lineHeight: 1.6, verticalAlign: "top" }

/** Таблица на широком экране, стопка карточек на телефоне: те же ячейки, подписи колонок переезжают внутрь карточки. */
export function PrivacyTable({ cols, rows }: { cols: string[]; rows: ReactNode[][] }) {
  const mobile = useIsMobile(720)
  if (mobile) {
    return (
      <div style={{ display: "grid", gap: 12 }}>
        {rows.map((cells, i) => (
          <article key={i} className="docs-card" style={card}>
            {cells.map((cell, j) => j === 0
              ? <h3 key={j} style={{ ...h3, margin: 0 }}>{cell}</h3>
              : <div key={j} style={{ marginTop: 12 }}><div style={{ ...eyebrow, marginBottom: 4, color: v2.t4 }}>{cols[j]}</div><div style={body}>{cell}</div></div>)}
          </article>
        ))}
      </div>
    )
  }
  return (
    <div style={{ ...card, padding: "8px 8px 4px", overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr>{cols.map(c => <th key={c} scope="col" style={th}>{c}</th>)}</tr></thead>
        <tbody>
          {rows.map((cells, i) => (
            <tr key={i}>{cells.map((cell, j) => <td key={j} style={j === 0 ? { ...td, color: v2.t1, fontWeight: 500, width: "26%" } : td}>{cell}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
