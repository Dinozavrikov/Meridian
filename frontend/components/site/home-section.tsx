import type { CSSProperties, ReactNode } from "react"
import { v2 } from "@/lib/theme"

export const cardStyle: CSSProperties = { background: v2.surf, border: `1px solid ${v2.bd}`, borderRadius: 14, padding: 20, minWidth: 0 }
export const h3Style: CSSProperties = { margin: "0 0 8px", fontSize: 16, fontWeight: 600, color: v2.t1, overflowWrap: "anywhere" }
export const pStyle: CSSProperties = { margin: 0, fontSize: 14, lineHeight: 1.65, color: v2.t2, overflowWrap: "anywhere" }

/** Раздел главной: заголовок второго уровня, вводная строка и содержимое. */
export function HomeSection({ title, lead, children }: { title: string; lead: string; children: ReactNode }) {
  return (
    <section style={{ maxWidth: 1100, margin: "0 auto", width: "100%", padding: "64px 20px 0" }}>
      <h2 style={{ margin: "0 0 10px", fontSize: "clamp(24px, 3.4vw, 32px)", fontWeight: 600, letterSpacing: "-0.02em", color: v2.t1 }}>{title}</h2>
      <p style={{ margin: "0 0 28px", maxWidth: 720, fontSize: 16, lineHeight: 1.65, color: v2.t3 }}>{lead}</p>
      {children}
    </section>
  )
}
