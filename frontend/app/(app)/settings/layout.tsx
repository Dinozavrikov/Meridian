"use client"
import { Header } from "@/components/layout/header"
import { PageShell, PageContent } from "@/components/layout/page-shell"
import { SettingsNav } from "@/components/settings/settings-nav"
import { useIsMobile } from "@/components/layout/resizable-layout"
import { Settings } from "lucide-react"

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const isMobile = useIsMobile()

  return (
    <PageShell>
      <Header titleKey="page.settings.title" icon={<Settings size={14} />} color="#8b80f0" />
      <PageContent noPadding overflow="auto">
        <div style={{ minHeight: "100%", display: "flex", flexDirection: "column" }}>
          <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: isMobile ? "column" : "row" }}>
            <SettingsNav mobile={isMobile} />
            <div style={{ flex: 1, minWidth: 0, padding: isMobile ? "20px" : "40px 48px" }}>
              {children}
            </div>
          </div>
        </div>
      </PageContent>
    </PageShell>
  )
}
