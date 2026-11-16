"use client"
import { Lock, Users } from "lucide-react"
import { useMyLabs } from "@/lib/use-my-labs"
import { theme } from "@/lib/theme"
import { useT } from "@/lib/i18n/useT"
/** Выбор назначения — личное или лаборатория. Общий для репоста записи и комментария. */
export function DestinationPicker({ target, labId, onTargetChange, onLabChange }: {
  target: "personal" | "lab"; labId: number | null
  onTargetChange: (t: "personal" | "lab") => void
  onLabChange: (id: number) => void
}) {
  const t = useT()
  const { data: labs = [] } = useMyLabs()
  return (
    <div>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => onTargetChange("personal")} style={{
          flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
          padding: "10px 8px", borderRadius: 9,
          border: `1px solid ${target === "personal" ? "#4A90D950" : theme.ln2}`,
          background: target === "personal" ? "#4A90D914" : theme.bg2,
          color: target === "personal" ? "#4A90D9" : theme.tx3,
        }}>
          <Lock size={14} />
          <span style={{ fontSize: 11, fontWeight: target === "personal" ? 600 : 400 }}>{t("destinationPicker.personal")}</span>
        </button>
        <button onClick={() => onTargetChange("lab")} disabled={labs.length === 0} style={{
          flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
          padding: "10px 8px", borderRadius: 9,
          border: `1px solid ${target === "lab" ? "#9B59B650" : theme.ln2}`,
          background: target === "lab" ? "#9B59B614" : theme.bg2,
          color: target === "lab" ? "#9B59B6" : theme.tx3,
          opacity: labs.length === 0 ? 0.5 : 1,
        }}>
          <Users size={14} />
          <span style={{ fontSize: 11, fontWeight: target === "lab" ? 600 : 400 }}>{t("destinationPicker.lab")}</span>
        </button>
      </div>
      {target === "lab" && (
        <select value={labId ?? ""} onChange={e => onLabChange(Number(e.target.value))} style={{
          width: "100%", marginTop: 8, padding: "9px 12px", borderRadius: 8,
          border: `1px solid ${theme.ln2}`, background: theme.bg2, color: theme.tx1, fontSize: 13,
        }}>
          <option value="">{t("visibility.selectLab")}</option>
          {labs.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      )}
    </div>
  )
}
