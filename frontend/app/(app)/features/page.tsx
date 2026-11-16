"use client"
import { PageShell, PageContent } from "@/components/layout/page-shell"
import { Header } from "@/components/layout/header"
import { useT } from "@/lib/i18n/useT"
import { v2 } from "@/lib/theme"
import { FeatureHero } from "@/components/features/FeatureHero"
import { FeatureStats } from "@/components/features/FeatureStats"
import { FeatureExplorer } from "@/components/features/FeatureExplorer"
import { FeatureStages } from "@/components/features/FeatureStages"
import { FeatureTracks } from "@/components/features/FeatureTracks"
import { FeatureInventory } from "@/components/features/FeatureInventory"

export default function FeaturesPage() {
  const t = useT()
  return (
    <PageShell>
      <Header titleKey="page.features.title" color="#4A90D9" />
      <PageContent>
        <div style={{ maxWidth: 1200, margin: "0 auto", width: "100%" }}>
          <FeatureHero />
          <FeatureStats />
          <FeatureExplorer />
          <FeatureStages />
          <FeatureTracks />
          <FeatureInventory />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "baseline", marginTop: 72, paddingTop: 28, borderTop: `1px solid ${v2.bd}` }}>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.7, color: v2.t3 }}>{t("page.features.footer.note")}</p>
            <a className="feat-link" href="/roadmap" style={{ fontSize: 14 }}>{t("page.features.footer.link")}</a>
          </div>
        </div>
      </PageContent>
    </PageShell>
  )
}
