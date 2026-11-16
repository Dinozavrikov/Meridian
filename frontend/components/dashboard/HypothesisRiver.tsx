"use client"
import { useMemo } from "react"
import { v2 } from "@/lib/theme"
import { Card, Label, EmptyState } from "./primitives"
import { Lightbulb } from "lucide-react"
import { useT } from "@/lib/i18n/useT"

interface Stage { key: string; labelKey: string; color: string }

const STAGES: Stage[] = [
  { key: "идея",                  labelKey: "dashboard.river.stage.idea",    color: v2.violet },
  { key: "активная проверка",     labelKey: "dashboard.river.stage.active",  color: v2.teal },
  { key: "ожидание данных",       labelKey: "dashboard.river.stage.waiting", color: v2.amber },
  { key: "частично подтверждена", labelKey: "dashboard.river.stage.partial", color: "#c9c4b8" },
]

/** Catmull-Rom → серия кубических Безье-сегментов (без ведущего M). */
function crSegments(points: [number, number][]): string {
  let d = ""
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[i + 2] ?? p2
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6
    d += `C ${c1x} ${c1y} ${c2x} ${c2y} ${p2[0]} ${p2[1]} `
  }
  return d
}

export function HypothesisRiver({ hypByStatus }: { hypByStatus: Record<string, number> }) {
  const t = useT()
  const total = STAGES.reduce((s, st) => s + (hypByStatus[st.key] ?? 0), 0)

  const { path, stops } = useMemo(() => {
    if (total === 0) return { path: "", stops: [] as { offset: number; color: string }[] }

    const cy = 45
    const thickness = STAGES.map(st => {
      const pct = (hypByStatus[st.key] ?? 0) / total
      return Math.min(12 + pct * 66, 44)
    })
    const xs = [10, 115, 305, 495, 685, 790]
    const topPts: [number, number][] = [
      [xs[0], cy - 5], [xs[1], cy - thickness[0] / 2], [xs[2], cy - thickness[1] / 2],
      [xs[3], cy - thickness[2] / 2], [xs[4], cy - thickness[3] / 2], [xs[5], cy - 5],
    ]
    const botPts: [number, number][] = [
      [xs[5], cy + 5], [xs[4], cy + thickness[3] / 2], [xs[3], cy + thickness[2] / 2],
      [xs[2], cy + thickness[1] / 2], [xs[1], cy + thickness[0] / 2], [xs[0], cy + 5],
    ]
    let d = `M ${topPts[0][0]} ${topPts[0][1]} `
    d += crSegments(topPts)
    d += `L ${botPts[0][0]} ${botPts[0][1]} `
    d += crSegments(botPts)
    d += "Z"

    // Границы стадий соответствуют xs — резкие цветовые переходы внутри одной гладкой ленты.
    const bounds = [xs[0], 210, 400, 590, xs[5]].map(x => x / 800)
    const gradStops: { offset: number; color: string }[] = []
    STAGES.forEach((st, i) => {
      gradStops.push({ offset: bounds[i], color: st.color })
      gradStops.push({ offset: bounds[i + 1], color: st.color })
    })

    return { path: d, stops: gradStops }
  }, [total, hypByStatus])

  return (
    <Card>
      {total === 0 ? (
        <EmptyState
          icon={<Lightbulb size={15} />}
          title={t("dashboard.river.empty.title")}
          actionLabel={t("dashboard.river.empty.action")}
          actionHref="/hypotheses"
        />
      ) : (
        <>
          <svg viewBox="0 0 800 90" style={{ width: "100%", height: 100, display: "block" }}>
            <defs>
              <linearGradient id="riverGrad" x1="0" x2="1" y1="0" y2="0">
                {stops.map((s, i) => (
                  <stop key={i} offset={s.offset} stopColor={s.color} />
                ))}
              </linearGradient>
            </defs>
            <path d={path} fill="url(#riverGrad)" fillOpacity={0.92} />
          </svg>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginTop: 12, paddingTop: 14, borderTop: `0.5px solid ${v2.bd}` }}>
            {STAGES.map(st => {
              const val = hypByStatus[st.key] ?? 0
              const pct = total ? Math.round((val / total) * 100) : 0
              return (
                <div key={st.key} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11.5, color: v2.t2 }}>
                  <span style={{ width: 7, height: 7, borderRadius: 2, background: st.color, flexShrink: 0 }} />
                  {t(st.labelKey)}
                  <span style={{ fontFamily: v2.fontMono, color: v2.t3, fontSize: 10.5 }}>{val} · {pct}%</span>
                </div>
              )
            })}
          </div>
        </>
      )}
    </Card>
  )
}
