"use client"
import { useT } from "@/lib/i18n/useT"
import { AI_ABILITIES } from "@/lib/roadmap"
import { v2 } from "@/lib/theme"
import { FeatureSectionHead } from "@/components/features/FeatureSectionHead"

export function RoadmapAI() {
  const t = useT()
  return (
    <section style={{ marginBottom: 88 }}>
      <FeatureSectionHead title={t("roadmapPage.ai.title")} lead={t("roadmapPage.ai.lead")} />
      <div data-ai-host style={{
        display: "flex", gap: 16, alignItems: "flex-start", marginBottom: 16, padding: "22px 24px", borderRadius: 14,
        background: `color-mix(in srgb, ${v2.amber} 7%, ${v2.surf})`, border: `1px solid color-mix(in srgb, ${v2.amber} 30%, ${v2.bd})`,
      }}>
        <span aria-hidden="true" style={{ flexShrink: 0, width: 10, height: 10, marginTop: 5, borderRadius: "50%", background: v2.amber, boxShadow: `0 0 12px ${v2.amber}` }} />
        <div>
          <div style={{ marginBottom: 6, fontSize: 11, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: v2.amber }}>{t("roadmapPage.ai.host.eyebrow")}</div>
          <div style={{ marginBottom: 8, fontSize: 18, fontWeight: 600, color: v2.t1 }}>{t("roadmapPage.ai.host.title")}</div>
          <p style={{ margin: 0, maxWidth: 780, fontSize: 14, lineHeight: 1.7, color: v2.t2 }}>{t("roadmapPage.ai.host.text")}</p>
        </div>
      </div>
      <div className="feat-inv-grid" style={{ "--tile-color": v2.teal } as React.CSSProperties}>
        {AI_ABILITIES.map(a => (
          <div key={a} data-ai={a} className="feat-inv-tile">
            <span style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.3, color: v2.t1 }}>{t(`roadmapPage.ai.${a}.name`)}</span>
            <span style={{ fontSize: 12.5, lineHeight: 1.55, color: v2.t3 }}>{t(`roadmapPage.ai.${a}.text`)}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
