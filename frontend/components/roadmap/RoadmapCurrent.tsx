"use client"
import { useT } from "@/lib/i18n/useT"
import { CURRENT } from "@/lib/roadmap"
import { ACCENT } from "@/lib/utils"
import { FeatureSectionHead } from "@/components/features/FeatureSectionHead"
import { RoadmapEntryCard } from "./RoadmapEntryCard"

export function RoadmapCurrent() {
  const t = useT()
  return (
    <section style={{ marginBottom: 88 }}>
      <FeatureSectionHead title={t("roadmapPage.current.title")} lead={t("roadmapPage.current.lead")} />
      <div style={{ maxWidth: 780 }}><RoadmapEntryCard entry={CURRENT} accent={ACCENT} big /></div>
    </section>
  )
}
