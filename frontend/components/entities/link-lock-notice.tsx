"use client"
import { Lock } from "lucide-react"
import { useT } from "@/lib/i18n/useT"
import { StatusBadge } from "@/components/ui/status-badge"
import { ink } from "@/lib/theme"

export interface LinkLock { code: string; status?: string }

/** Почему связь нельзя менять: замок, заголовок, статус прогноза (если причина в нём) и объяснение. */
export function LinkLockNotice({ lock }: { lock: LinkLock }) {
  const t = useT()
  const known = lock.code === "pred_closed" || lock.code === "other_author"
  if (!known) return null
  return (
    <div role="note" style={{ display: "flex", gap: 10, padding: "10px 12px", borderRadius: 10, background: ink.well, border: `1px solid ${ink.line}` }}>
      <Lock size={15} aria-hidden style={{ color: ink.label, flexShrink: 0, marginTop: 2 }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#d6d9ec" }}>{t(`relations.lock.${lock.code}.title`)}</div>
        {lock.code === "pred_closed" && lock.status && (
          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, fontSize: 12, color: ink.muted }}>
            {t("relations.lock.outcome")}<StatusBadge status={lock.status} fontSize={12} />
          </div>
        )}
        <div style={{ fontSize: 12, lineHeight: 1.55, color: ink.muted }}>{t(`relations.lock.${lock.code}.text`)}</div>
      </div>
    </div>
  )
}
