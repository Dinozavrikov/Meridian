"use client"
import { PageShell, PageContent } from "@/components/layout/page-shell"
import { Header } from "@/components/layout/header"
import { RoadmapHero } from "@/components/roadmap/RoadmapHero"
import { RoadmapShipped } from "@/components/roadmap/RoadmapShipped"
import { RoadmapAI } from "@/components/roadmap/RoadmapAI"
import { RoadmapCurrent } from "@/components/roadmap/RoadmapCurrent"
import { RoadmapNext } from "@/components/roadmap/RoadmapNext"
import { RoadmapVision } from "@/components/roadmap/RoadmapVision"
import { RoadmapCta } from "@/components/roadmap/RoadmapCta"

export default function RoadmapPage() {
  return (
    <PageShell>
      <Header titleKey="page.roadmap.title" color="#4A90D9" />
      <PageContent>
        <div style={{ maxWidth: 1200, margin: "0 auto", width: "100%" }}>
          <RoadmapHero />
          <RoadmapShipped />
          <RoadmapAI />
          <RoadmapCurrent />
          <RoadmapNext />
          <RoadmapVision />
          <RoadmapCta />
        </div>
      </PageContent>
    </PageShell>
  )
}
