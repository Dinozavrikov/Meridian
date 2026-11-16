"use client"
import { useState } from "react"
import { useStore } from "@/lib/store"
import { authApi } from "@/lib/api"
import { useT } from "@/lib/i18n/useT"
import { SettingsSection } from "@/components/settings/settings-section"
import { ProfileAvatar } from "@/components/settings/profile-avatar"
import { Card } from "@/components/ui/card"
import { Input, Textarea } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { User } from "lucide-react"
import { v2 } from "@/lib/theme"

export default function ProfileSettingsPage() {
  const { user, setUser } = useStore()
  const t = useT()
  const [form, setForm] = useState({ display_name: user?.display_name ?? "", bio: user?.bio ?? "" })
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(false)
  const f = (k: "display_name" | "bio") => (e: any) => setForm(p => ({ ...p, [k]: e.target.value }))

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const updated = await authApi.updateMe(form)
      setUser(updated)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch {}
    finally { setLoading(false) }
  }

  return (
    <SettingsSection
      icon={<User size={16} />} color={v2.violet}
      title={t("settings.profile.title")}
      subtitle={t("settings.profile.subtitle")}
    >
      <form onSubmit={save} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Card>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <ProfileAvatar size={76} />
            <Input label={t("settings.profile.displayName")} value={form.display_name} onChange={f("display_name")} />
            <Textarea label={t("settings.profile.bio")} value={form.bio} onChange={f("bio")} rows={3} placeholder={t("settings.profile.bioPlaceholder")} />
          </div>
        </Card>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {saved && <span style={{ fontSize: 12, color: v2.teal }}>{t("settings.saved")}</span>}
          <Button type="submit" variant="primary" disabled={loading}>
            {loading ? t("settings.saving") : t("settings.profile.save")}
          </Button>
        </div>
      </form>
    </SettingsSection>
  )
}
