import type { CSSProperties } from "react"
import { v2 } from "@/lib/theme"

export const card: CSSProperties = { padding: "20px 22px", borderRadius: 14, background: v2.surf, border: `1px solid ${v2.bd}` }
export const grid = (min: number): CSSProperties => ({ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(min(${min}px, 100%), 1fr))`, gap: 16 })
export const h3: CSSProperties = { margin: "0 0 8px", fontSize: 16, fontWeight: 600, letterSpacing: "-0.01em", color: v2.t1 }
export const body: CSSProperties = { margin: 0, fontSize: 14, lineHeight: 1.65, color: v2.t3 }
export const eyebrow: CSSProperties = { marginBottom: 10, fontSize: 11, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: v2.teal }
export const linkBtn: CSSProperties = { display: "inline-block", marginTop: 14, fontSize: 13, color: v2.teal, textDecoration: "none" }
