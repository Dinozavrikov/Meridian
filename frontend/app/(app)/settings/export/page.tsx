"use client"
import { useState } from "react"
import { exportApi } from "@/lib/api"
import { SettingsSection } from "@/components/settings/settings-section"
import { useT } from "@/lib/i18n/useT"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Download } from "lucide-react"
import { v2 } from "@/lib/theme"

export default function ExportSettingsPage() {
  const t = useT()
  const [loading, setLoading] = useState(false)

  const download = async () => {
    setLoading(true)
    try {
      const data = await exportApi.download()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `meridian-export-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setLoading(false)
    }
  }

  return (
    <SettingsSection icon={<Download size={16} />} color={v2.teal} title={t("settingsNav.export")}>
      <Card>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 13, color: v2.t1 }}>{t("settings.export.description")}</div>
            <div style={{ fontSize: 11, color: v2.t3, marginTop: 2 }}>{t("settings.export.contentsHint")}</div>
          </div>
          <Button variant="outline" onClick={download} disabled={loading}>
            {loading ? t("settings.export.preparing") : t("settings.export.downloadButton")}
          </Button>
        </div>
      </Card>
    </SettingsSection>
  )
}
