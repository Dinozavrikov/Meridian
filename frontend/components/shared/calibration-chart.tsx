"use client"
import { v2 } from "@/lib/theme"

/** Вынесено из profile/[username]/page.tsx (29.09) — переиспользуется вкладкой калибровки
 * лабы (lab-calibration-tab.tsx), чтобы не дублировать SVG-отрисовку бакетов и сводки.
 * Сам компонент не знает, чей это счёт (личный на профиле или участника лабы) — только
 * рисует переданные данные; подпись контекста ("твоя калибровка" vs "калибровка участника")
 * остаётся на вызывающей стороне через заголовок рядом. */
export function CalibrationChart({ data, t }: { data: { bucket_label: string; predicted_mid: number; actual_pct: number; count: number }[]; t: (key: string, vars?: Record<string, string | number>) => string }) {
  if (!data || data.length < 2) {
    return (
      <div style={{ fontSize: 11, color: v2.t3, fontStyle: "italic", padding: "30px 0", textAlign: "center" }}>
        {t("profilePage.calibrationInsufficientData")}
      </div>
    )
  }
  const x = (v: number) => 30 + (v / 100) * 200
  const y = (v: number) => 170 - (v / 100) * 150
  const points = data.map(d => `${x(d.predicted_mid)},${y(d.actual_pct)}`).join(" ")
  return (
    <>
      <svg width="100%" height="200" viewBox="0 0 260 200">
        <line x1={30} y1={170} x2={230} y2={20} stroke="rgba(255,255,255,0.15)" strokeDasharray="3 4" strokeWidth={1} />
        <line x1={30} y1={170} x2={230} y2={170} stroke="rgba(255,255,255,0.12)" />
        <line x1={30} y1={170} x2={30} y2={20} stroke="rgba(255,255,255,0.12)" />
        <polyline points={points} fill="none" stroke="#4dcfa6" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        {data.map((d, i) => (
          <circle key={i} cx={x(d.predicted_mid)} cy={y(d.actual_pct)} r={3.5} fill="#4dcfa6">
            <title>{t("profilePage.calibrationTooltip", { bucket: d.bucket_label, count: d.count, pct: d.actual_pct })}</title>
          </circle>
        ))}
        <text x={30} y={185} fontSize={9.5} fill={v2.t3} textAnchor="middle">0%</text>
        <text x={230} y={185} fontSize={9.5} fill={v2.t3} textAnchor="middle">100%</text>
      </svg>
      <div style={{ display: "flex", gap: 14, marginTop: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: v2.t3 }}>
          <div style={{ width: 10, height: 2, background: "#4dcfa6" }} /> {t("profilePage.calibrationActualLabel")}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: v2.t3 }}>
          <div style={{ width: 10, height: 2, background: "rgba(255,255,255,0.25)" }} /> {t("profilePage.calibrationPerfectLabel")}
        </div>
      </div>
    </>
  )
}

// Сводный балл поверх графика по бакетам — та же выборка прогнозов, но одним числом,
// честно сглаженным по числу закрытых прогнозов (мало данных → ближе к нейтральным 50%).
export function CalibrationSummary({ summary, t }: { summary: { score_pct: number; n_closed: number; confidence_pct: number; deleted_unverified?: number } | null; t: (key: string, vars?: Record<string, string | number>) => string }) {
  if (!summary) return null
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
      <span style={{ fontSize: 22, fontWeight: 700, color: v2.teal, fontFamily: "monospace", lineHeight: 1 }}>
        {summary.score_pct}%
      </span>
      <span style={{ fontSize: 11, color: v2.t3, lineHeight: 1.4 }}>
        {t("profilePage.calibrationSummary", { n: summary.n_closed, conf: summary.confidence_pct })}
      </span>
      {!!summary.deleted_unverified && (
        <span style={{ fontSize: 10.5, color: v2.t3, lineHeight: 1.4 }}>
          · {t("profilePage.calibrationDeletedUnverified", { n: summary.deleted_unverified })}
        </span>
      )}
    </div>
  )
}
