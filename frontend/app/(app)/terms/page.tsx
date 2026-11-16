"use client"
import { PageShell, PageContent } from "@/components/layout/page-shell"
import { Header } from "@/components/layout/header"
import { useIsMobile } from "@/lib/use-is-mobile"
import { v2 } from "@/lib/theme"
import { SECTIONS, sectionTitleKey, type SectionId } from "@/lib/terms"
import { SectionToc } from "@/components/ui/section-toc"
import { TermsHero } from "@/components/terms/TermsHero"
import { TermsBody } from "@/components/terms/TermsBody"

export default function TermsPage() {
  const mobile = useIsMobile(900)
  return (
    <PageShell>
      <Header titleKey="termsPage.pageTitle" color="#4A90D9" />
      {/* visible: без собственной прокрутки, иначе закрепленное оглавление прилипнет к блоку, а не к окну */}
      <PageContent overflow="visible">
        <div style={{ maxWidth: 1200, margin: "0 auto", width: "100%", ["--docs-accent" as string]: v2.teal }}>
          <TermsHero />
          <div style={{ display: mobile ? "block" : "grid", gridTemplateColumns: "220px minmax(0, 1fr)", gap: 48, alignItems: "start" }}>
            <SectionToc ids={SECTIONS} titleKey={id => sectionTitleKey(id as SectionId)} labelKey="legalPage.toc.label" />
            <div style={{ minWidth: 0, paddingBottom: 72 }}><TermsBody /></div>
          </div>
        </div>
      </PageContent>
    </PageShell>
  )
}
