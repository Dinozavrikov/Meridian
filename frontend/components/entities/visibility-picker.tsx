"use client"
import { Lock, Users, Globe } from "lucide-react"
import { useT } from "@/lib/i18n/useT"
import { ink } from "@/lib/theme"

interface VisibilityPickerProps {
  value: string
  onChange: (v: string) => void
  labId: number | null
  onLabChange: (id: number | null) => void
  labs: { id: number; name: string }[]
  accent: string
}

/** Выбор видимости: три карточки с описаниями и список лабораторий. Один для паспорта и модалки публикации. */
export function VisibilityPicker({ value, onChange, labId, onLabChange, labs, accent }: VisibilityPickerProps) {
  const t = useT()
  const opts = [
    { value: "private", label: t("visibility.private"), desc: t("publishVis.private.desc"), icon: Lock, color: "#9090b0" },
    { value: "lab", label: t("visibility.lab"), desc: t("publishVis.lab.desc"), icon: Users, color: "#4A90D9" },
    { value: "public", label: t("visibility.public"), desc: t("publishVis.public.desc"), icon: Globe, color: accent },
  ]
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {opts.map(o => {
        const Icon = o.icon
        const active = value === o.value
        return (
          <button key={o.value} type="button" aria-label={o.label} aria-pressed={active}
            onClick={() => { onChange(o.value); if (o.value !== "lab") onLabChange(null) }}
            style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 10, textAlign: "left", cursor: "pointer",
              border: `1px solid ${active ? o.color + "60" : ink.line}`, background: active ? o.color + "10" : "transparent", transition: "all 0.12s" }}>
            <Icon size={16} style={{ color: o.color, flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: active ? "#e8e8f0" : ink.label }}>{o.label}</div>
              <div style={{ fontSize: 12, color: ink.muted, marginTop: 2 }}>{o.desc}</div>
            </div>
          </button>
        )
      })}
      {value === "lab" && (
        <select value={labId ?? ""} onChange={e => onLabChange(e.target.value ? Number(e.target.value) : null)}
          style={{ padding: "8px 12px", borderRadius: 8, border: `1px solid ${ink.line}`, background: ink.well, color: "#b0b0c0", fontSize: 13 }}>
          <option value="">{t("visibility.selectLab")}</option>
          {labs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      )}
    </div>
  )
}
