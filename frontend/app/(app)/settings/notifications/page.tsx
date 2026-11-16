"use client"
import { useEffect, useState } from "react"
import { notifPrefsApi } from "@/lib/api"
import { useT } from "@/lib/i18n/useT"
import { SettingsSection } from "@/components/settings/settings-section"
import { Card } from "@/components/ui/card"
import { Toggle } from "@/components/ui/toggle"
import { Bell } from "lucide-react"
import { v2 } from "@/lib/theme"

export default function NotificationsSettingsPage() {
  const t = useT()
  const ROWS: { key: "new_messages" | "comments" | "prediction_reminders"; label: string; desc: string }[] = [
    { key: "new_messages", label: t("settings.notifications.newMessages.label"), desc: t("settings.notifications.newMessages.desc") },
    { key: "comments", label: t("settings.notifications.comments.label"), desc: t("settings.notifications.comments.desc") },
    { key: "prediction_reminders", label: t("settings.notifications.predictionReminders.label"), desc: t("settings.notifications.predictionReminders.desc") },
  ]
  const [prefs, setPrefs] = useState<Record<string, boolean> | null>(null)

  useEffect(() => { notifPrefsApi.get().then(setPrefs) }, [])

  const toggle = async (key: string) => {
    if (!prefs) return
    const prev = prefs
    const next = { ...prefs, [key]: !prefs[key] }
    setPrefs(next)
    try { await notifPrefsApi.update({ [key]: next[key] } as any) } catch { setPrefs(prev) }
  }

  if (!prefs) return null

  return (
    <SettingsSection icon={<Bell size={16} />} color={v2.amber} title={t("settings.notifications.title")}>
      <Card>
        {ROWS.map((row, i) => (
          <div key={row.key} style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "12px 0", borderBottom: i < ROWS.length - 1 ? `1px solid ${v2.bd}` : "none",
          }}>
            <div>
              <div style={{ fontSize: 13, color: v2.t1 }}>{row.label}</div>
              <div style={{ fontSize: 11, color: v2.t3, marginTop: 2 }}>{row.desc}</div>
            </div>
            <Toggle checked={prefs[row.key]} onChange={() => toggle(row.key)} />
          </div>
        ))}
      </Card>
    </SettingsSection>
  )
}
