"use client"
import { Fragment } from "react"
import { useT } from "@/lib/i18n/useT"
import { FOUNDATION_NODE, NEXT_STEPS, VISION, pad2 } from "@/lib/roadmap"
import { KIND_COLOR, NODE_BY_KEY } from "@/lib/features-map"
import { v2 } from "@/lib/theme"
import { FeatureSectionHead } from "@/components/features/FeatureSectionHead"
import { RoadmapEntryCard } from "./RoadmapEntryCard"

export function RoadmapNext() {
  const t = useT()
  const base = NODE_BY_KEY[FOUNDATION_NODE]
  const chipStyle = { cursor: "default", "--node-color": v2.amber } as React.CSSProperties
  return (
    <section style={{ marginBottom: 88 }}>
      <FeatureSectionHead title={t("roadmapPage.next.title")} lead={t("roadmapPage.next.lead")} />
      <ol data-order style={{ listStyle: "none", margin: "0 0 20px", padding: 0, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        {NEXT_STEPS.map((s, i) => (
          <Fragment key={s.key}>
            <li><span className="feat-chip" style={chipStyle}><span style={{ color: v2.amber, fontWeight: 600 }}>{pad2(i + 1)}</span>{t(`roadmapPage.item.${s.key}.name`)}</span></li>
            <li aria-hidden="true" style={{ color: v2.t4 }}>→</li>
          </Fragment>
        ))}
        <li><span className="feat-chip" style={{ cursor: "default", "--node-color": KIND_COLOR.community, borderStyle: "dashed" } as React.CSSProperties}>{t(`roadmapPage.item.${VISION.key}.name`)}</span></li>
      </ol>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))", gap: 16 }}>
        {NEXT_STEPS.map((s, i) => <RoadmapEntryCard key={s.key} entry={s} accent={v2.amber} eyebrow={pad2(i + 1)} />)}
      </div>
      <div data-foundation style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 14, marginTop: 16, padding: "16px 20px", border: `1px dashed ${v2.bd2}`, borderRadius: 14 }}>
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: v2.t4 }}>{t("roadmapPage.next.foundation.eyebrow")}</span>
        <span className="feat-chip" style={{ cursor: "default", "--node-color": base.color } as React.CSSProperties}><span className="feat-dot" />{t(base.nameKey)}</span>
        <span style={{ flex: "1 1 300px", fontSize: 13.5, lineHeight: 1.6, color: v2.t3 }}>{t("roadmapPage.next.foundation.text")}</span>
      </div>
    </section>
  )
}
