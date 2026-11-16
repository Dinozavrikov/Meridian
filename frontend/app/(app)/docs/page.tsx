"use client"
import { PageShell, PageContent } from "@/components/layout/page-shell"
import { Header } from "@/components/layout/header"
import { useT } from "@/lib/i18n/useT"
import { useIsMobile } from "@/lib/use-is-mobile"
import { v2 } from "@/lib/theme"
import { DIVERSITY_CARDS } from "@/lib/docs"
import { DocsProvider } from "@/components/docs/docs-context"
import { DocsHero } from "@/components/docs/DocsHero"
import { DocsToc } from "@/components/docs/DocsToc"
import { DocsSection } from "@/components/docs/DocsSection"
import { DocsQuickStart } from "@/components/docs/DocsQuickStart"
import { DocsRecords } from "@/components/docs/DocsRecords"
import { DocsFormula } from "@/components/docs/DocsFormula"
import { DocsCalculator } from "@/components/docs/DocsCalculator"
import { DocsCalibration, DocsCards } from "@/components/docs/DocsCards"
import { DocsStages } from "@/components/docs/DocsStages"
import { DocsVisibility } from "@/components/docs/DocsVisibility"
import { DocsSafety } from "@/components/docs/DocsSafety"
import { DocsAi } from "@/components/docs/DocsAi"
import { DocsFaq } from "@/components/docs/DocsFaq"
import { DocsCta } from "@/components/docs/DocsCta"
import { h3, body } from "@/components/docs/docs-style"

export default function DocsPage() {
  const t = useT()
  const mobile = useIsMobile(900)
  return (
    <PageShell>
      <Header titleKey="docsPage.pageTitle" color="#4A90D9" />
      {/* visible: без собственной прокрутки, иначе закрепленное оглавление прилипнет к блоку, а не к окну */}
      <PageContent overflow="visible">
        <DocsProvider>
          <div style={{ maxWidth: 1200, margin: "0 auto", width: "100%", ["--docs-accent" as string]: v2.teal }}>
            <DocsHero />
            <div style={{ display: mobile ? "block" : "grid", gridTemplateColumns: "220px minmax(0, 1fr)", gap: 48, alignItems: "start" }}>
              <DocsToc />
              <div style={{ minWidth: 0 }}>
                <DocsSection id="start"><DocsQuickStart /></DocsSection>
                <DocsSection id="records"><DocsRecords /></DocsSection>
                <DocsSection id="maturity">
                  <DocsFormula />
                  <h3 style={{ ...h3, margin: "44px 0 6px", fontSize: 22 }}>{t("docsPage.calc.title")}</h3>
                  <p style={{ ...body, maxWidth: 720, marginBottom: 20 }}>{t("docsPage.calc.lead")}</p>
                  <DocsCalculator />
                </DocsSection>
                <DocsSection id="calibration"><DocsCalibration /></DocsSection>
                <DocsSection id="diversity"><DocsCards ns="diversity" cards={DIVERSITY_CARDS} /></DocsSection>
                <DocsSection id="stages"><DocsStages /></DocsSection>
                <DocsSection id="visibility"><DocsVisibility /></DocsSection>
                <DocsSection id="safety"><DocsSafety /></DocsSection>
                <DocsSection id="ai"><DocsAi /></DocsSection>
                <DocsSection id="faq"><DocsFaq /></DocsSection>
                <DocsCta />
              </div>
            </div>
          </div>
        </DocsProvider>
      </PageContent>
    </PageShell>
  )
}
