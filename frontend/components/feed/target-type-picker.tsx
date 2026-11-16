"use client"
import { Eye, Lightbulb, TrendingUp, Compass, HelpCircle } from "lucide-react"
import { typeColor, theme } from "@/lib/theme"
import { useTypeRu } from "@/lib/i18n/useTypeRu"

const TARGET_TYPES: { value: string; icon: any }[] = [
  { value: "observation", icon: Eye },
  { value: "hypothesis",  icon: Lightbulb },
  { value: "prediction",  icon: TrendingUp },
  { value: "worldview",   icon: Compass },
  { value: "question",    icon: HelpCircle },
]

/** Выбор целевого типа сущности — общий для репоста записи и репоста комментария. */
export function TargetTypePicker({ value, onChange }: { value: string; onChange: (t: string) => void }) {
  const typeRu = useTypeRu()
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {TARGET_TYPES.map(({ value: t, icon: Icon }) => {
        const active = value === t
        const color = typeColor[t]
        return (
          <button key={t} onClick={() => onChange(t)} style={{
            display: "flex", alignItems: "center", gap: 6,
            fontSize: 12, fontWeight: active ? 600 : 400,
            padding: "7px 12px", borderRadius: 8,
            border: `1px solid ${active ? color + "50" : theme.ln2}`,
            background: active ? `${color}14` : "transparent",
            color: active ? color : theme.tx3,
          }}>
            <Icon size={13} /> {typeRu[t]}
          </button>
        )
      })}
    </div>
  )
}
