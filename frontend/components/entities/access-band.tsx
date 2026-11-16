"use client"
// Полоса доступа: «Открыто лаборатории X · только чтение» + действие. Один вид для менеджера связей и окна доступа.
// tone="closed": нейтральная полоса после закрытия; expireAfter: через столько мс плавно схлопывается и зовёт onExpire.
import { useEffect, useState } from "react"
import type { LucideIcon } from "lucide-react"
import { v2 } from "@/lib/theme"

export const COLLAPSE_AFTER_MS = 8000
const COLLAPSE_MS = 280

export interface BandAction { label: string; onClick: () => void; disabled?: boolean; icon?: LucideIcon; danger?: boolean }
interface Props {
  icon: LucideIcon
  title: string
  hint?: string
  action: BandAction
  tone?: "open" | "closed"
  expireAfter?: number
  onExpire?: () => void
  testId?: string
}

const CSS = `
.ab-wrap{display:grid;grid-template-rows:1fr;opacity:1;transition:grid-template-rows ${COLLAPSE_MS}ms ease,opacity ${COLLAPSE_MS}ms ease}
.ab-wrap[data-collapsed="true"]{grid-template-rows:0fr;opacity:0}
.ab-act{display:inline-flex;align-items:center;gap:6px;flex-shrink:0;padding:5px 12px;border-radius:8px;font-size:12.5px;font-weight:600;cursor:pointer;background:transparent;border:1px solid ${v2.bd2};color:${v2.t1};transition:border-color .12s,color .12s,background .12s}
.ab-act:hover:not(:disabled){border-color:${v2.teal};color:${v2.teal};background:${v2.teal}14}
.ab-act[data-danger="true"]:hover:not(:disabled){border-color:${v2.red};color:${v2.red};background:${v2.red}14}
.ab-act:disabled{opacity:.5;cursor:default}
@media (prefers-reduced-motion:reduce){.ab-wrap{transition:none}}
`

export function AccessBand({ icon: Icon, title, hint, action, tone = "open", expireAfter, onExpire, testId }: Props) {
  const [collapsed, setCollapsed] = useState(false)
  useEffect(() => {
    if (expireAfter == null) return
    const a = setTimeout(() => setCollapsed(true), expireAfter)
    const b = setTimeout(() => onExpire?.(), expireAfter + COLLAPSE_MS)
    return () => { clearTimeout(a); clearTimeout(b) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expireAfter])
  const open = tone === "open"
  const color = open ? v2.teal : v2.t4
  const ActionIcon = action.icon
  return (
    <div className="ab-wrap" data-testid={testId ?? "access-band"} data-collapsed={collapsed ? "true" : "false"}>
      <style>{CSS}</style>
      <div style={{ overflow: "hidden", minHeight: 0 }}>
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10, padding: "8px 10px", borderRadius: 10,
          background: open ? `${v2.teal}14` : v2.surf2, border: `1px solid ${open ? `${v2.teal}40` : v2.bd}` }}>
          <span aria-hidden style={{ width: 26, height: 26, borderRadius: 8, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: `${color}26` }}>
            <Icon size={14} color={color} />
          </span>
          <span style={{ flex: "1 1 160px", minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: open ? v2.t1 : v2.t3, overflowWrap: "anywhere" }}>{title}</span>
            {hint && <span style={{ fontSize: 11.5, color: v2.t3 }}>{hint}</span>}
          </span>
          <button type="button" className="ab-act" data-danger={action.danger ? "true" : undefined} disabled={action.disabled} onClick={action.onClick}>
            {ActionIcon && <ActionIcon size={13} aria-hidden />}{action.label}
          </button>
        </div>
      </div>
    </div>
  )
}
