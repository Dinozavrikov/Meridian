"use client"
// Единый диалог «выбор действия»: заголовок, сводка, варианты-карточки (иконка, название, описание, предупреждение), отмена.
// Все диалоги с выбором строим через него. Цифры 1–9 выбирают вариант, Esc и клик по фону отменяют (это делает Modal).
import { useEffect } from "react"
import type { LucideIcon } from "lucide-react"
import { Modal } from "@/components/ui/modal"
import { v2 } from "@/lib/theme"

export type ChoiceTone = "default" | "warn" | "danger"
export interface DialogChoice { key: string; label: string; description?: string; icon?: LucideIcon; tone?: ChoiceTone; note?: string }

const TONE: Record<ChoiceTone, string> = { default: v2.teal, warn: v2.amber, danger: v2.red }

interface Props {
  open: boolean
  title: string
  onClose: () => void
  summary?: React.ReactNode
  choices: DialogChoice[]
  onChoose: (key: string) => void
  cancelLabel: string
  footnote?: React.ReactNode
}

export function ActionDialog({ open, title, onClose, summary, choices, onChoose, cancelLabel, footnote }: Props) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const n = Number(e.key)
      if (Number.isInteger(n) && n >= 1 && n <= choices.length) { e.preventDefault(); onChoose(choices[n - 1].key) }
    }
    document.addEventListener("keydown", h)
    return () => document.removeEventListener("keydown", h)
  }, [open, choices, onChoose])

  return (
    <Modal open={open} onClose={onClose} title={title} size="md" compact zIndex={300}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 13.5, lineHeight: 1.55 }}>
        {summary}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {choices.map((c, k) => {
            const color = TONE[c.tone ?? "default"]
            const Icon = c.icon
            return (
              <button key={c.key} type="button" data-choice={c.key} onClick={() => onChoose(c.key)}
                className="transition hover:brightness-125"
                style={{ display: "grid", gridTemplateColumns: "28px 1fr auto", gap: 12, alignItems: "start", textAlign: "left", cursor: "pointer",
                         padding: "11px 13px", borderRadius: 10, background: v2.surf2, color: v2.t1,
                         border: `1px solid ${c.tone && c.tone !== "default" ? color + "66" : v2.bd2}` }}>
                <span style={{ width: 28, height: 28, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: `${color}1f` }}>
                  {Icon && <Icon size={15} color={color} />}
                </span>
                <span style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 600 }}>{c.label}</span>
                  {c.description && <span style={{ fontSize: 12.5, color: v2.t3, lineHeight: 1.5 }}>{c.description}</span>}
                  {c.note && <span style={{ fontSize: 12, color }}>{c.note}</span>}
                </span>
                <kbd style={{ fontFamily: v2.fontMono, fontSize: 11, color: v2.t4, border: `1px solid ${v2.bd2}`, borderRadius: 5, padding: "0 6px" }}>{k + 1}</kbd>
              </button>
            )
          })}
        </div>
        {footnote && <div style={{ color: v2.t3, fontSize: 12.5, display: "flex", flexDirection: "column", gap: 4 }}>{footnote}</div>}
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button type="button" onClick={onClose}
            style={{ padding: "7px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", border: `1px solid ${v2.bd2}`, background: "transparent", color: v2.t2 }}>
            {cancelLabel}
          </button>
        </div>
      </div>
    </Modal>
  )
}
