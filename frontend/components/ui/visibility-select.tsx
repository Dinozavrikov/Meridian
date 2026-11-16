"use client"
import { Lock, Users, Globe } from "lucide-react"
import { useT } from "@/lib/i18n/useT"

interface VisibilitySelectProps {
  value: string
  onChange: (v: string) => void
  labId?: number | null
  onLabChange?: (id: number | null) => void
  labs?: { id: number; name: string }[]
  accent?: string
}

export function VisibilitySelect({ value, onChange, labId, onLabChange, labs = [], accent = "#1ABC9C" }: VisibilitySelectProps) {
  const t = useT()
  const opts = [
    { value: "private", label: t("visibility.private"), icon: Lock,  color: "#9090b0" },
    { value: "lab",     label: t("visibility.lab"),     icon: Users, color: "#4A90D9" },
    { value: "public",  label: t("visibility.public"),  icon: Globe, color: accent    },
  ]
  return (
    <div>
      <div style={{ fontSize: 11, color: "#909090", fontWeight: 500, marginBottom: 8 }}>{t("field.visibility")}</div>
      <div style={{ display: "flex", gap: 14 }}>
        {opts.map(o => {
          const Icon = o.icon
          const active = value === o.value
          return (
            <button key={o.value} type="button" onClick={() => {
              onChange(o.value)
              // Инвариант зашит здесь, а не в каждом вызывающем коде отдельно —
              // lab_id должен существовать только вместе с visibility === "lab".
              // Иначе запись с visibility="private"/"public" может унести
              // "залипший" lab_id и стать видимой участникам лабы в обход
              // выбора пользователя (см. review: privacy findings, баг №1).
              if (o.value !== "lab" && onLabChange) onLabChange(null)
            }}
              style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "14px 10px", borderRadius: 10, border: `1px solid ${active ? o.color + "60" : "#2a2a2a"}`, background: active ? o.color + "12" : "#111", cursor: "pointer", transition: "all 0.12s" }}>
              <Icon size={14} style={{ color: active ? o.color : "#989898" }} />
              <span style={{ fontSize: 10, color: active ? o.color : "#999999", fontWeight: active ? 600 : 400 }}>{o.label}</span>
            </button>
          )
        })}
      </div>
      {value === "lab" && onLabChange && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 11, color: "#909090", fontWeight: 500, marginBottom: 8 }}>{t("entityType.lab")}</div>
          <select value={labId ?? ""} onChange={e => onLabChange(e.target.value ? Number(e.target.value) : null)}
            style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid #2a2a2a", background: "#1c1c1c", color: "#e8e8e8", fontSize: 13, outline: "none" }}>
            <option value="">{t("visibility.selectLab")}</option>
            {labs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
      )}
    </div>
  )
}
