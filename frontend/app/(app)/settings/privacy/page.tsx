"use client"
import { useState } from "react"
import { useStore } from "@/lib/store"
import { authApi } from "@/lib/api"
import { useT } from "@/lib/i18n/useT"
import { SettingsSection } from "@/components/settings/settings-section"
import { Card } from "@/components/ui/card"
import { Select } from "@/components/ui/select"
import { Eye } from "lucide-react"
import { v2 } from "@/lib/theme"

export default function PrivacySettingsPage() {
  const { user, setUser } = useStore()
  const t = useT()
  const OPTIONS = [
    { value: "private", label: t("settings.privacy.option.private") },
    { value: "lab", label: t("settings.privacy.option.lab") },
    { value: "public", label: t("settings.privacy.option.public") },
  ]
  const [value, setValue] = useState(user?.default_visibility ?? "private")
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const save = async (v: string) => {
    setValue(v)
    setSaving(true)
    try {
      const updated = await authApi.updateMe({ default_visibility: v })
      setUser(updated)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch {}
    finally { setSaving(false) }
  }

  return (
    <SettingsSection
      icon={<Eye size={16} />} color={v2.teal}
      title={t("settings.privacy.title")}
      subtitle={t("settings.privacy.subtitle")}
    >
      <Card>
        <Select
          label={t("settings.privacy.defaultVisibility")} options={OPTIONS} value={value}
          onChange={e => save(e.target.value)} disabled={saving}
        />
        {saved && <span style={{ fontSize: 12, color: v2.teal, marginTop: 10, display: "block" }}>{t("settings.saved")}</span>}
      </Card>
    </SettingsSection>
  )
}
