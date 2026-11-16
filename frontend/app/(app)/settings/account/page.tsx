"use client"
import { useState } from "react"
import { useStore } from "@/lib/store"
import { authApi } from "@/lib/api"
import { useT } from "@/lib/i18n/useT"
import { SettingsSection } from "@/components/settings/settings-section"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { KeyRound } from "lucide-react"
import { mono, v2 } from "@/lib/theme"
import { apiErrorMessage } from "@/lib/api-error"

function StaticField({ label, value, badge }: { label: string; value: string; badge?: string }) {
  return (
    <div>
      <span style={{
        fontSize: 11, color: v2.t3, textTransform: "uppercase",
        letterSpacing: "0.05em", marginBottom: 7, display: "block",
      }}>{label}</span>
      <div style={{
        ...mono(v2.t2, 13),
        padding: "10px 13px", background: "rgba(255,255,255,0.015)",
        borderRadius: 9, border: `1px solid ${v2.bd}`,
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <span>{value}</span>
        {badge && (
          <span style={{
            fontSize: 9.5, padding: "2px 7px", borderRadius: 4,
            background: "rgba(74,144,217,0.12)", color: "#4A90D9",
            border: "1px solid rgba(74,144,217,0.25)",
          }}>{badge}</span>
        )}
      </div>
    </div>
  )
}

export default function AccountSettingsPage() {
  const { user, setUser } = useStore()
  const t = useT()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ new_email: "", password: "" })
  const [error, setError] = useState("")
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(false)

  const cancel = () => {
    setEditing(false)
    setForm({ new_email: "", password: "" })
    setError("")
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      const updated = await authApi.changeEmail(form)
      setUser(updated)
      setEditing(false)
      setForm({ new_email: "", password: "" })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err: any) {
      setError(apiErrorMessage(err, t("settings.account.changeEmailError")))
    } finally {
      setLoading(false)
    }
  }

  return (
    <SettingsSection
      icon={<KeyRound size={16} />} color="#4A90D9"
      title={t("settings.account.title")}
      subtitle={t("settings.account.subtitle")}
    >
      <Card>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <StaticField label={t("settings.account.username")} value={`@${user?.username ?? ""}`} badge={t("settings.account.usernameBadge")} />

          {!editing ? (
            <div>
              <span style={{
                fontSize: 11, color: v2.t3, textTransform: "uppercase",
                letterSpacing: "0.05em", marginBottom: 7, display: "block",
              }}>{t("settings.account.email")}</span>
              <div style={{
                ...mono(v2.t2, 13),
                padding: "10px 13px", background: "rgba(255,255,255,0.015)",
                borderRadius: 9, border: `1px solid ${v2.bd}`,
                display: "flex", alignItems: "center", justifyContent: "space-between",
              }}>
                <span>{user?.email}</span>
                <span onClick={() => setEditing(true)} style={{ fontSize: 11.5, color: "#4A90D9", cursor: "pointer" }}>
                  {t("actions.edit")}
                </span>
              </div>
              {saved && <span style={{ fontSize: 12, color: v2.teal, marginTop: 8, display: "block" }}>{t("settings.account.emailChanged")}</span>}
            </div>
          ) : (
            <form onSubmit={save} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <Input
                label={t("settings.account.newEmail")} type="email" value={form.new_email}
                onChange={e => setForm(p => ({ ...p, new_email: e.target.value }))}
                required
              />
              <Input
                label={t("settings.account.passwordConfirm")} type="password" placeholder="••••••••"
                value={form.password}
                onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                required
              />
              {error && <span style={{ fontSize: 12, color: v2.red }}>{error}</span>}
              <div style={{ display: "flex", gap: 8 }}>
                <Button type="submit" variant="primary" size="sm" disabled={loading}>
                  {loading ? t("settings.saving") : t("settings.account.saveEmail")}
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={cancel}>{t("actions.cancel")}</Button>
              </div>
            </form>
          )}
        </div>
      </Card>
    </SettingsSection>
  )
}
