import type { CSSProperties } from "react"
import { theme, v2 } from "@/lib/theme"

// Кнопки — свои классы: отступы Tailwind в проекте не работают (глобальный сброс padding без слоя),
// поэтому и Button из components/ui на этих экранах не используется.
export const LC_CSS = `
.lc-btn{display:inline-flex;align-items:center;gap:6px;padding:7px 14px;border-radius:8px;border:1px solid ${theme.ln2};background:transparent;color:${theme.tx1};font-size:12px;font-weight:500;cursor:pointer;transition:border-color .12s,color .12s,filter .12s}
.lc-btn:hover:not(:disabled){border-color:${theme.accent};color:${theme.accent}}
.lc-btn:disabled{opacity:.5;cursor:default}
.lc-on{border-color:${theme.accent};color:${theme.accent};background:${theme.accent}14}
.lc-primary{background:${theme.accent};border-color:${theme.accent};color:#fff}
.lc-primary:hover:not(:disabled){color:#fff;filter:brightness(1.12)}
.lc-link{display:inline-flex;align-items:center;gap:5px;background:none;border:none;padding:0;color:${theme.tx3};font-size:12px;cursor:pointer}
.lc-link:hover{color:${theme.tx1}}
`

export const muted: CSSProperties = { fontSize: 12, color: theme.tx3, lineHeight: 1.6 }
export const card: CSSProperties = {
  background: theme.bg2, border: `1px solid ${theme.ln2}`, borderRadius: 12, padding: "14px 16px",
  display: "flex", flexDirection: "column", gap: 10,
}
export const chip: CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, padding: "1px 8px", borderRadius: 999, border: "1px solid currentColor",
}
export const eyebrow: CSSProperties = { fontSize: 11, fontWeight: 700, color: v2.t2, textTransform: "uppercase", letterSpacing: "0.06em" }
