"use client"
import { askConfirmText } from "@/lib/confirm"
import { useEffect, useState } from "react"
import { authApi, sessionsApi } from "@/lib/api"
import { useT } from "@/lib/i18n/useT"
import { SettingsSection } from "@/components/settings/settings-section"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { ShieldCheck } from "lucide-react"
import { v2 } from "@/lib/theme"
import { apiErrorMessage } from "@/lib/api-error"

interface Session {
  id: number
  user_agent: string
  ip_address: string
  created_at: string
  last_seen_at: string
  is_current: boolean
}

export default function SecuritySettingsPage() {
  const t = useT()
  const [pw, setPw] = useState({ current_password: "", new_password: "" })
  const [pwError, setPwError] = useState("")
  const [pwSaved, setPwSaved] = useState(false)
  const [pwLoading, setPwLoading] = useState(false)
  const [sessions, setSessions] = useState<Session[]>([])

  useEffect(() => { sessionsApi.list().then(setSessions) }, [])

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPwError("")
    setPwLoading(true)
    try {
      await authApi.changePassword(pw)
      setPw({ current_password: "", new_password: "" })
      setPwSaved(true)
      setTimeout(() => setPwSaved(false), 2000)
    } catch (err: any) {
      setPwError(apiErrorMessage(err, t("settings.security.changeError")))
    } finally {
      setPwLoading(false)
    }
  }

  const revoke = async (id: number) => {
    if (!(await askConfirmText(t("settings.security.confirmRevoke"), t("confirm.revoke")))) return
    await sessionsApi.revoke(id)
    setSessions(s => s.filter(x => x.id !== id))
  }

  return (
    <SettingsSection icon={<ShieldCheck size={16} />} color="#4A90D9" title={t("settings.security.title")}>
      <form onSubmit={changePassword}>
        <Card>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Input
              label={t("settings.security.currentPassword")} type="password" placeholder="••••••••"
              value={pw.current_password}
              onChange={e => setPw(p => ({ ...p, current_password: e.target.value }))}
            />
            <Input
              label={t("settings.security.newPassword")} type="password" placeholder="••••••••"
              value={pw.new_password}
              onChange={e => setPw(p => ({ ...p, new_password: e.target.value }))}
            />
            {pwError && <span style={{ fontSize: 12, color: v2.red }}>{pwError}</span>}
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {pwSaved && <span style={{ fontSize: 12, color: v2.teal }}>{t("settings.security.passwordChanged")}</span>}
              <Button type="submit" variant="primary" disabled={pwLoading}>
                {pwLoading ? t("settings.saving") : t("settings.security.changePassword")}
              </Button>
            </div>
          </div>
        </Card>
      </form>

      <Card>
        <div style={{ fontSize: 11, color: v2.t3, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>
          {t("settings.security.activeSessions")}
        </div>
        {sessions.map((s, i) => (
          <div key={s.id} style={{
            display: "flex", alignItems: "center", gap: 12, padding: "12px 0",
            borderBottom: i < sessions.length - 1 ? `1px solid ${v2.bd}` : "none",
          }}>
            <div style={{
              width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
              background: s.is_current ? v2.teal : v2.t3,
              boxShadow: s.is_current ? "0 0 6px rgba(77,207,166,0.6)" : "none",
            }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, color: v2.t1 }}>{s.user_agent || t("settings.security.unknownDevice")}</div>
              <div style={{ fontSize: 10.5, color: v2.t3, marginTop: 1 }}>
                {s.is_current ? t("settings.security.thisDeviceNow") : s.last_seen_at}
              </div>
            </div>
            {!s.is_current && (
              <span onClick={() => revoke(s.id)} style={{ fontSize: 11, color: v2.red, cursor: "pointer", marginLeft: "auto" }}>
                {t("settings.security.revoke")}
              </span>
            )}
          </div>
        ))}
      </Card>
    </SettingsSection>
  )
}
