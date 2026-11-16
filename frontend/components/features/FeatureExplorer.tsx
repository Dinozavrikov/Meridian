"use client"
import { useState } from "react"
import { useStore } from "@/lib/store"
import { useT } from "@/lib/i18n/useT"
import { useIsMobile } from "@/lib/use-is-mobile"
import { usePersonalFeatureMetrics } from "@/lib/use-personal-feature-metrics"
import type { LegendKey, NodeKey } from "@/lib/features-map"
import { FeatureMap } from "./FeatureMap"
import { FeatureLegend } from "./FeatureLegend"
import { FeatureDetailPanel } from "./FeatureDetailPanel"
import { FeatureSectionHead } from "./FeatureSectionHead"

export function FeatureExplorer() {
  const t = useT()
  const { user } = useStore()
  const mobile = useIsMobile(720)
  const [selected, setSelected] = useState<NodeKey>("hypothesis")
  const [showAll, setShowAll] = useState(false)
  const [personal, setPersonal] = useState(false)
  const [pinned, setPinned] = useState<LegendKey | null>(null)
  const [hover, setHover] = useState<LegendKey | null>(null)
  const showPersonal = personal && !!user
  const { metricFor } = usePersonalFeatureMetrics(showPersonal)
  return (
    <section style={{ marginBottom: 88 }}>
      <FeatureSectionHead title={t("featuresPage.map.title")} lead={t("featuresPage.map.lead")} />
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <button type="button" className="feat-chip" aria-pressed={showAll} onClick={() => setShowAll(v => !v)}>
          {t(showAll ? "featuresPage.map.coreOnly" : "featuresPage.map.showAll")}
        </button>
        {user ? (
          <button type="button" className="feat-chip" aria-pressed={showPersonal} onClick={() => setPersonal(v => !v)}>
            {t(showPersonal ? "featuresPage.personal.hide" : "featuresPage.personal.show")}
          </button>
        ) : (
          <a className="feat-chip" href="/login">{t("featuresPage.personal.login")}</a>
        )}
      </div>
      <FeatureMap selected={selected} showAll={showAll} onSelect={setSelected} highlight={hover ?? pinned} />
      {!mobile && <FeatureLegend pinned={pinned} onHover={setHover} onPin={k => setPinned(p => (p === k ? null : k))} />}
      <FeatureDetailPanel selected={selected} metric={showPersonal ? metricFor(selected) : null} onSelect={setSelected} />
    </section>
  )
}
