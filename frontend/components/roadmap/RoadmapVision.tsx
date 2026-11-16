"use client"
import { useT } from "@/lib/i18n/useT"
import { VISION } from "@/lib/roadmap"
import { KIND_COLOR } from "@/lib/features-map"
import { ACCENT } from "@/lib/utils"
import { v2 } from "@/lib/theme"
import { FeatureSectionHead } from "@/components/features/FeatureSectionHead"
import { RoadmapStageTrack } from "./RoadmapStageTrack"

const N = 6
const C = 70
const R = 52
const POINTS = Array.from({ length: N }, (_, i) => [C + R * Math.cos((2 * Math.PI * i) / N - Math.PI / 2), C + R * Math.sin((2 * Math.PI * i) / N - Math.PI / 2)] as const)

/** Схема сети: «звезда» через один центр или «сетка» напрямую. */
function Topology({ kind, label }: { kind: "hub" | "mesh"; label: string }) {
  const color = KIND_COLOR.community
  const lines: [number, number][] = kind === "mesh"
    ? POINTS.flatMap((_, i) => [[i, (i + 1) % N], [i, (i + 2) % N]] as [number, number][])
    : []
  return (
    <svg data-topology={kind} role="img" aria-label={label} viewBox="0 0 140 140" style={{ width: "100%", maxWidth: 170 }}>
      {kind === "hub" && POINTS.map(([x, y], i) => <line key={i} x1={C} y1={C} x2={x} y2={y} stroke={v2.t4} strokeWidth={1.4} />)}
      {lines.map(([a, b]) => <line key={`${a}-${b}`} x1={POINTS[a][0]} y1={POINTS[a][1]} x2={POINTS[b][0]} y2={POINTS[b][1]} stroke={color} strokeWidth={1.2} opacity={0.65} />)}
      {POINTS.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={5.5} fill={kind === "mesh" ? color : v2.t3} />)}
      {kind === "hub" && <circle cx={C} cy={C} r={9} fill={ACCENT} />}
    </svg>
  )
}

export function RoadmapVision() {
  const t = useT()
  const accent = KIND_COLOR.community
  return (
    <section style={{ marginBottom: 72 }}>
      <FeatureSectionHead title={t("roadmapPage.vision.title")} lead={t("roadmapPage.vision.lead")} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))", gap: 16 }}>
        <article data-entry={VISION.key} style={{
          display: "flex", flexDirection: "column", gap: 14, padding: "28px 30px", borderRadius: 16,
          background: `linear-gradient(135deg, color-mix(in srgb, ${accent} 10%, ${v2.surf}) 0%, ${v2.surf} 65%)`,
          border: `1px solid color-mix(in srgb, ${accent} 35%, ${v2.bd})`,
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: accent }}>{t("roadmapPage.vision.eyebrow")}</div>
          <h3 style={{ margin: 0, fontSize: 24, fontWeight: 600, lineHeight: 1.25, letterSpacing: "-0.015em", color: v2.t1 }}>{t(`roadmapPage.item.${VISION.key}.name`)}</h3>
          <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.7, color: v2.t2 }}>{t(`roadmapPage.item.${VISION.key}.text`)}</p>
          <div data-open style={{ padding: "12px 16px", borderLeft: `2px dashed ${accent}`, borderRadius: "0 10px 10px 0", background: `color-mix(in srgb, ${accent} 6%, transparent)` }}>
            <div style={{ marginBottom: 4, fontSize: 10, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: accent }}>{t("roadmapPage.vision.openLabel")}</div>
            <div style={{ fontSize: 13.5, lineHeight: 1.6, color: v2.t3 }}>{t(`roadmapPage.item.${VISION.key}.open`)}</div>
          </div>
          <div style={{ marginTop: "auto", paddingTop: 8 }}><RoadmapStageTrack stage={VISION.stage} /></div>
        </article>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {([["hub", "now"], ["mesh", "then"]] as const).map(([kind, k]) => (
            <figure key={kind} style={{ margin: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "24px 14px", background: v2.surf, border: `1px solid ${v2.bd}`, borderRadius: 16 }}>
              <Topology kind={kind} label={t(`roadmapPage.vision.${k}Caption`)} />
              <figcaption style={{ textAlign: "center" }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: v2.t1 }}>{t(`roadmapPage.vision.${k}`)}</div>
                <div style={{ marginTop: 4, fontSize: 12.5, lineHeight: 1.5, color: v2.t3 }}>{t(`roadmapPage.vision.${k}Caption`)}</div>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  )
}
