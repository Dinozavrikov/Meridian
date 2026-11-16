"use client"
import { useT } from "@/lib/i18n/useT"
import { ACCENT, TYPE_COLORS } from "@/lib/utils"
import { v2 } from "@/lib/theme"
import { AUTHOR_QUESTION } from "@/lib/roadmap"
import { RoadmapStageTrack } from "./RoadmapStageTrack"

export function RoadmapHero() {
  const t = useT()
  const title = t("roadmapPage.hero.title")
  const accent = t("roadmapPage.hero.accent")
  const at = title.indexOf(accent)
  const qc = TYPE_COLORS["question"]
  return (
    <section style={{ padding: "56px 0 64px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, fontSize: 12, fontWeight: 600, letterSpacing: "0.16em", textTransform: "uppercase", color: ACCENT }}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: ACCENT }} />
        {t("roadmapPage.eyebrow")}
      </div>
      <h1 style={{ margin: "0 0 20px", maxWidth: 860, fontSize: "clamp(32px, 5vw, 52px)", lineHeight: 1.08, fontWeight: 600, letterSpacing: "-0.03em", color: v2.t1 }}>
        {at >= 0 ? <>{title.slice(0, at)}<span style={{ color: v2.teal }}>{accent}</span>{title.slice(at + accent.length)}</> : title}
      </h1>
      <p style={{ margin: "0 0 20px", maxWidth: 700, fontSize: 18, lineHeight: 1.6, color: v2.t2 }}>{t("roadmapPage.hero.lead")}</p>
      <p style={{ margin: 0, maxWidth: 700, padding: "14px 18px", fontSize: 14.5, lineHeight: 1.7, color: v2.t3, background: v2.surf, borderLeft: `2px solid ${v2.bd2}`, borderRadius: "0 10px 10px 0" }}>
        {t("roadmapPage.hero.origin")}
      </p>
      <article data-author-question style={{
        maxWidth: 780, marginTop: 40, padding: "26px 28px", borderRadius: 16,
        background: `linear-gradient(135deg, color-mix(in srgb, ${qc} 10%, ${v2.surf}) 0%, ${v2.surf} 65%)`,
        border: `1px solid color-mix(in srgb, ${qc} 35%, ${v2.bd})`,
        boxShadow: `0 24px 60px -36px ${qc}`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, fontSize: 11, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: qc }}>
          <span style={{ width: 8, height: 8, borderRadius: 3, background: qc }} />
          {t("roadmapPage.author.eyebrow")}
        </div>
        <h2 style={{ margin: "0 0 10px", fontSize: 22, fontWeight: 600, lineHeight: 1.35, letterSpacing: "-0.015em", color: v2.t1 }}>{t(`roadmapPage.item.${AUTHOR_QUESTION.key}.name`)}</h2>
        <p style={{ margin: "0 0 22px", fontSize: 14, lineHeight: 1.65, color: v2.t3 }}>{t(`roadmapPage.item.${AUTHOR_QUESTION.key}.text`)}</p>
        <RoadmapStageTrack stage={AUTHOR_QUESTION.stage} />
      </article>
    </section>
  )
}
