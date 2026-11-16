"use client"
// Всплывающие уведомления (см. lib/toast.ts): сообщение, необязательное «Вернуть», автозакрытие. Самодостаточный:
// свой портал и стили. Фокус не перехватывает; пока на карточке мышь или фокус, таймер стоит.
import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { AlertTriangle, Check, Info, Undo2, X, XCircle } from "lucide-react"
import { v2 } from "@/lib/theme"
import { useT } from "@/lib/i18n/useT"
import { setToastHandler, toast, toastDurationMs, type ToastCloseReason, type ToastRequest, type ToastTone } from "@/lib/toast"

const TONE: Record<ToastTone, string> = { success: v2.teal, info: v2.violet, warn: v2.amber, error: v2.red }
const ICON = { success: Check, info: Info, warn: AlertTriangle, error: XCircle } as const
const MAX_VISIBLE = 3

interface Item { id: number; req: ToastRequest; busy: boolean }

const CSS = `
@keyframes tt-in{from{opacity:0;transform:translateY(10px) scale(.98)}to{opacity:1;transform:none}}
.tt-stack{position:fixed;left:50%;bottom:max(18px,env(safe-area-inset-bottom));transform:translateX(-50%);z-index:350;display:flex;flex-direction:column;gap:8px;width:min(440px,calc(100vw - 24px));pointer-events:none}
.tt-card{pointer-events:auto;display:flex;align-items:center;gap:11px;padding:10px 10px 10px 14px;border-radius:12px;background:${v2.surf2};border:1px solid ${v2.bd2};border-left:3px solid var(--tt);box-shadow:0 14px 40px rgba(0,0,0,.5);animation:tt-in .2s cubic-bezier(.2,.9,.3,1)}
.tt-msg{flex:1;min-width:0;font:500 13.5px/1.4 ${v2.fontSans};color:${v2.t1};overflow-wrap:anywhere}
.tt-act{display:inline-flex;align-items:center;gap:6px;flex-shrink:0;min-height:32px;padding:0 11px;border-radius:8px;border:1px solid var(--tt);background:transparent;color:var(--tt);font:600 12.5px/1 ${v2.fontSans};cursor:pointer;transition:background .12s}
.tt-act:hover:not(:disabled){background:var(--tt-bg)}
.tt-act:disabled{opacity:.55;cursor:default}
.tt-x{display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;width:28px;height:28px;border-radius:8px;border:none;background:transparent;color:${v2.t4};cursor:pointer}
.tt-x:hover{background:${v2.surf};color:${v2.t1}}
.tt-act:focus-visible,.tt-x:focus-visible{outline:2px solid var(--tt);outline-offset:2px}
@media (prefers-reduced-motion:reduce){.tt-card{animation:none}}
`

function Card({ item, onClose, onUndo }: { item: Item; onClose: () => void; onUndo: () => void }) {
  const t = useT()
  const [hold, setHold] = useState(false)
  const tone = item.req.tone ?? "info"
  const color = TONE[tone]
  const Icon = ICON[tone]
  const ms = toastDurationMs(item.req)

  useEffect(() => {
    if (hold || item.busy || ms <= 0) return
    const id = setTimeout(onClose, ms)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hold, item.busy, ms])

  return (
    <div className="tt-card" role={tone === "error" || tone === "warn" ? "alert" : "status"}
      style={{ ["--tt" as string]: color, ["--tt-bg" as string]: `${color}1f` }}
      onMouseEnter={() => setHold(true)} onMouseLeave={() => setHold(false)}
      onFocus={() => setHold(true)} onBlur={() => setHold(false)}
      onKeyDown={e => { if (e.key === "Escape") { e.stopPropagation(); onClose() } }}>
      <Icon size={16} color={color} aria-hidden style={{ flexShrink: 0 }} />
      <span className="tt-msg">{item.req.message}</span>
      {item.req.undo && (
        <button type="button" className="tt-act" disabled={item.busy} onClick={onUndo}>
          <Undo2 size={13} aria-hidden />{item.req.undo.label ?? t("toast.undo")}
        </button>
      )}
      <button type="button" className="tt-x" aria-label={t("toast.dismiss")} onClick={onClose}><X size={14} aria-hidden /></button>
    </div>
  )
}

export function ToastHost() {
  const t = useT()
  const [items, setItems] = useState<Item[]>([])
  const seq = useRef(0)

  // Зеркало состояния: onClose вызываем вне setState-колбэка (в StrictMode тот вызывается дважды).
  const itemsRef = useRef<Item[]>([])
  const apply = useCallback((fn: (prev: Item[]) => Item[]) => {
    itemsRef.current = fn(itemsRef.current)
    setItems(itemsRef.current)
  }, [])
  const close = useCallback((id: number, reason: ToastCloseReason = "closed") => {
    const gone = itemsRef.current.find(i => i.id === id)
    if (!gone) return
    apply(prev => prev.filter(i => i.id !== id))
    gone.req.onClose?.(reason)
  }, [apply])

  useEffect(() => {
    setToastHandler(req => {
      const id = ++seq.current
      const all = [...itemsRef.current, { id, req, busy: false }]
      const dropped = all.slice(0, -MAX_VISIBLE)
      apply(() => all.slice(-MAX_VISIBLE))
      dropped.forEach(d => d.req.onClose?.("closed"))
    })
    return () => setToastHandler(null)
  }, [])

  const runUndo = async (item: Item) => {
    apply(prev => prev.map(i => i.id === item.id ? { ...i, busy: true } : i))
    try {
      await item.req.undo!.run()
      close(item.id, "undone")
    } catch {
      close(item.id)
      toast({ message: t("toast.actionFailed"), tone: "error" })
    }
  }

  if (items.length === 0 || typeof document === "undefined") return null
  return createPortal(
    <div className="tt-stack" aria-live="polite">
      <style>{CSS}</style>
      {items.map(i => <Card key={i.id} item={i} onClose={() => close(i.id)} onUndo={() => runUndo(i)} />)}
    </div>,
    document.body,
  )
}
