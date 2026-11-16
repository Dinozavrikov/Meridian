"use client"
import { PageShell, PageContent } from "@/components/layout/page-shell"
import { Header } from "@/components/layout/header"
import { useIsMobile } from "@/lib/use-is-mobile"
import { v2 } from "@/lib/theme"
import { SECTIONS, sectionTitleKey, type SectionId } from "@/lib/privacy"
import { SectionToc } from "@/components/ui/section-toc"
import { PrivacyProvider } from "@/components/privacy/privacy-context"
import { PrivacyHero } from "@/components/privacy/PrivacyHero"
import { PrivacySection } from "@/components/privacy/PrivacySection"
import { PrivacyContact, PrivacyData, PrivacyDeletion, PrivacyPartners, PrivacyStorage, PrivacySummary } from "@/components/privacy/PrivacySections"

export default function PrivacyPage() {
  const mobile = useIsMobile(900)
  return (
    <PageShell>
      <Header titleKey="privacyPage.pageTitle" color="#4dcfa6" />
      {/* visible: без собственной прокрутки, иначе закрепленное оглавление прилипнет к блоку, а не к окну */}
      <PageContent overflow="visible">
        <PrivacyProvider>
          <div style={{ maxWidth: 1200, margin: "0 auto", width: "100%", ["--docs-accent" as string]: v2.teal }}>
            <PrivacyHero />
            <div style={{ display: mobile ? "block" : "grid", gridTemplateColumns: "220px minmax(0, 1fr)", gap: 48, alignItems: "start" }}>
              <SectionToc ids={SECTIONS} titleKey={id => sectionTitleKey(id as SectionId)} labelKey="legalPage.toc.label" />
              <div style={{ minWidth: 0, paddingBottom: 72 }}>
                <PrivacySection id="summary"><PrivacySummary /></PrivacySection>
                <PrivacySection id="data"><PrivacyData /></PrivacySection>
                <PrivacySection id="storage"><PrivacyStorage /></PrivacySection>
                <PrivacySection id="partners"><PrivacyPartners /></PrivacySection>
                <PrivacySection id="deletion"><PrivacyDeletion /></PrivacySection>
                <PrivacySection id="contact"><PrivacyContact /></PrivacySection>
              </div>
            </div>
          </div>
        </PrivacyProvider>
      </PageContent>
    </PageShell>
  )
}
