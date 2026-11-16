"use client"
import { useT } from "@/lib/i18n/useT"
import { v2 } from "@/lib/theme"
import type { RoadmapEntry } from "@/lib/roadmap"
import { RoadmapStageTrack } from "./RoadmapStageTrack"

export function RoadmapEntryCard({ entry, accent, eyebrow, big }: { entry: RoadmapEntry; accent: string; eyebrow?: string; big?: boolean }) {
  const t = useT()
  return (
    <article data-entry={entry.key} style={{
      display: "flex", flexDirection: "column", gap: 12, padding: big ? "26px 28px" : "20px 22px",
      background: v2.surf, border: `1px solid ${v2.bd}`, borderTop: `2px solid ${accent}`, borderRadius: 14,
    }}>
      {eyebrow && <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: accent }}>{eyebrow}</div>}
      <h3 style={{ margin: 0, fontSize: big ? 22 : 17, fontWeight: 600, lineHeight: 1.3, letterSpacing: "-0.01em", color: v2.t1 }}>{t(`roadmapPage.item.${entry.key}.name`)}</h3>
      <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.65, color: v2.t3 }}>{t(`roadmapPage.item.${entry.key}.text`)}</p>
      <div style={{ marginTop: "auto", paddingTop: 8 }}><RoadmapStageTrack stage={entry.stage} /></div>
    </article>
  )
}
