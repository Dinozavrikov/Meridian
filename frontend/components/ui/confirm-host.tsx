"use client"
// Диалог подтверждения (см. lib/confirm.ts). Самодостаточный: свой портал и стили, без Modal и ActionDialog.
// Опасное действие: фокус на «Отмене», чтобы случайный Enter ничего не удалил. Esc и клик по фону отменяют.
import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { AlertTriangle, Check, Trash2 } from "lucide-react"
import { v2 } from "@/lib/theme"
import { useT } from "@/lib/i18n/useT"
import { setConfirmHandler, type ConfirmRequest } from "@/lib/confirm"

const TONE = { danger: v2.red, warn: v2.amber, default: v2.teal } as const
const ICON = { danger: Trash2, warn: AlertTriangle, default: Check } as const

const CSS = `
@keyframes cf-fade{from{opacity:0}to{opacity:1}}
@keyframes cf-pop{from{opacity:0;transform:translateY(10px) scale(.97)}to{opacity:1;transform:none}}
.cf-overlay{position:fixed;inset:0;z-index:400;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(5,6,10,.72);backdrop-filter:blur(4px);animation:cf-fade .16s ease}
.cf-card{width:100%;max-width:400px;box-sizing:border-box;padding:22px;border-radius:16px;background:${v2.surf};border:1px solid ${v2.bd2};box-shadow:0 24px 60px rgba(0,0,0,.55);animation:cf-pop .2s cubic-bezier(.2,.9,.3,1)}
.cf-btns{display:flex;justify-content:flex-end;gap:10px;margin-top:22px}
.cf-btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:38px;padding:0 16px;border-radius:10px;font:600 13.5px/1 ${v2.fontSans};cursor:pointer;transition:filter .12s,background .12s,border-color .12s}
.cf-btn:focus-visible{outline:2px solid var(--cf);outline-offset:2px}
.cf-cancel{background:transparent;border:1px solid ${v2.bd2};color:${v2.t2}}
.cf-cancel:hover{background:${v2.surf2};color:${v2.t1}}
.cf-ok{border:1px solid transparent;background:var(--cf);color:#0b0d14}
.cf-ok:hover{filter:brightness(1.1)}
.cf-kbd{font:500 11px ${v2.fontMono};color:${v2.t4};border:1px solid ${v2.bd2};border-radius:5px;padding:2px 5px}
@media (max-width:480px){.cf-btns{flex-direction:column-reverse}.cf-btn{width:100%;min-height:44px}.cf-kbd{display:none}}
@media (prefers-reduced-motion:reduce){.cf-overlay,.cf-card{animation:none}}
`

export function ConfirmHost() {
  const t = useT()
  const [req, setReq] = useState<ConfirmRequest | null>(null)
  const resolveRef = useRef<((v: boolean) => void) | null>(null)
  const queueRef = useRef<Promise<unknown>>(Promise.resolve())
  const cancelRef = useRef<HTMLButtonElement>(null)
  const okRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    setConfirmHandler(r => {
      const run = () => new Promise<boolean>(resolve => { resolveRef.current = resolve; setReq(r) })
      const p = queueRef.current.then(run)
      queueRef.current = p
      return p
    })
    return () => { setConfirmHandler(null); resolveRef.current?.(false); resolveRef.current = null }
  }, [])

  const answer = (v: boolean) => { resolveRef.current?.(v); resolveRef.current = null; setReq(null) }
  const tone = req?.tone ?? "danger"

  useEffect(() => {
    if (!req) return
    ;(tone === "default" ? okRef : cancelRef).current?.focus()
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); answer(false); return }
      if (e.key === "Tab") {
        const a = cancelRef.current, b = okRef.current
        if (!a || !b) return
        e.preventDefault()
        ;(document.activeElement === a ? b : a).focus()
      }
    }
    document.addEventListener("keydown", h)
    return () => document.removeEventListener("keydown", h)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [req])

  if (!req || typeof document === "undefined") return null
  const color = TONE[tone]
  const Icon = ICON[tone]
  return createPortal(
    <div className="cf-overlay" data-testid="confirm-overlay"
      onMouseDown={e => { if (e.target === e.currentTarget) answer(false) }}>
      <style>{CSS}</style>
      <div className="cf-card" role="dialog" aria-modal="true" aria-labelledby="cf-title" style={{ ["--cf" as string]: color }}>
        <span aria-hidden style={{ width: 42, height: 42, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center",
          background: `${color}1f`, border: `1px solid ${color}40`, marginBottom: 14 }}>
          <Icon size={19} color={color} />
        </span>
        <div id="cf-title" style={{ fontSize: 16.5, fontWeight: 600, color: v2.t1, lineHeight: 1.35 }}>{req.title}</div>
        {req.description && <div style={{ marginTop: 8, fontSize: 13.5, lineHeight: 1.55, color: v2.t3, whiteSpace: "pre-wrap" }}>{req.description}</div>}
        <div className="cf-btns">
          <button ref={cancelRef} type="button" className="cf-btn cf-cancel" onClick={() => answer(false)}>
            {t("actions.cancel")}<span className="cf-kbd" aria-hidden>Esc</span>
          </button>
          <button ref={okRef} type="button" className="cf-btn cf-ok" onClick={() => answer(true)}>
            <Icon size={14} aria-hidden />{req.confirmLabel ?? t("confirm.delete")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
