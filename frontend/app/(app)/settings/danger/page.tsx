"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { useStore } from "@/lib/store"
import { authApi } from "@/lib/api"
import { useT } from "@/lib/i18n/useT"
import { SettingsSection } from "@/components/settings/settings-section"
import { Card } from "@/components/ui/card"
import { Modal } from "@/components/ui/modal"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { AlertTriangle } from "lucide-react"
import { v2 } from "@/lib/theme"
import { apiErrorMessage } from "@/lib/api-error"

export default function DangerZonePage() {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const { setUser } = useStore()

  const confirmDelete = async () => {
    setLoading(true)
    setError("")
    try {
      await authApi.deleteAccount(password)
      setUser(null)
      router.push("/login")
    } catch (e: any) {
      setError(apiErrorMessage(e, t("settings.danger.deleteError")))
    } finally {
      setLoading(false)
    }
  }

  return (
    <SettingsSection icon={<AlertTriangle size={16} />} color={v2.red} title={t("settings.danger.title")}>
      <Card>
        <div style={{ fontSize: 13, fontWeight: 700, color: v2.red, marginBottom: 6 }}>{t("settings.danger.deleteAccount")}</div>
        <div style={{ fontSize: 12, color: v2.t3, lineHeight: 1.6, marginBottom: 16 }}>
          {t("settings.danger.deleteWarning")}
        </div>
        <Button variant="danger" onClick={() => setOpen(true)}>{t("settings.danger.deleteForever")}</Button>
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title={t("settings.danger.confirmTitle")} size="sm">
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <p style={{ fontSize: 13, color: v2.t2, margin: 0 }}>
            {t("settings.danger.confirmBody")}
          </p>
          <p style={{ fontSize: 12, color: v2.t3, lineHeight: 1.6, margin: 0 }}>
            {t("settings.danger.snapshotsNote")}
          </p>
          <Input
            type="password" placeholder={t("settings.danger.passwordPlaceholder")} value={password}
            onChange={e => setPassword(e.target.value)}
          />
          {error && <span style={{ fontSize: 12, color: v2.red }}>{error}</span>}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button variant="ghost" onClick={() => setOpen(false)}>{t("actions.cancel")}</Button>
            <Button variant="danger" onClick={confirmDelete} disabled={loading || !password}>
              {loading ? t("settings.danger.deleting") : t("settings.danger.deletePermanently")}
            </Button>
          </div>
        </div>
      </Modal>
    </SettingsSection>
  )
}
