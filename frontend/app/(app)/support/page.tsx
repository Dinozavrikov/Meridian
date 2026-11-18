"use client"
import { PageShell, PageContent } from "@/components/layout/page-shell"
import { Header } from "@/components/layout/header"
import { SupportContent } from "@/components/support/SupportContent"

export default function SupportPage() {
  return (
    <PageShell>
      <Header titleKey="support.pageTitle" color="#4dcfa6" />
      <PageContent overflow="visible">
        <SupportContent />
      </PageContent>
    </PageShell>
  )
}
