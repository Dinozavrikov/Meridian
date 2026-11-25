"use client"
import { useT } from "@/lib/i18n/useT"
import { TYPE_COLORS } from "@/lib/utils"
import { v2 } from "@/lib/theme"
import { EXAMPLE, PASSPORT_KEYS as K } from "@/lib/site/home"
import { useMaturityRange } from "@/components/site/use-maturity-range"

const row = { display: "flex", gap: 10, alignItems: "baseline", fontSize: 13, lineHeight: 1.5 } as const
const rowLabel = { fontWeight: 600, flexShrink: 0 } as const

/** Карточка-пример «Паспорт идеи»: придуманные значения, подписано как пример. Деления шкалы берутся из модели зрелости. */
export function PassportCard() {
  const t = useT()
  const range = useMaturityRange()
  const level = range ? Math.min(EXAMPLE.level, range.maxN) : null
  const levels = range ? Array.from({ length: range.maxN - range.minN + 1 }, (_, i) => range.minN + i) : []
  const hypothesis = TYPE_COLORS.hypothesis
  return (
    <aside aria-label={t(K.label)} style={{
      width: "100%", maxWidth: 440, justifySelf: "center", boxSizing: "border-box",
      background: v2.surf, border: `1px solid ${v2.bd2}`, borderRadius: 16, padding: 22,
      boxShadow: "0 24px 60px rgba(0,0,0,0.35)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: v2.t3 }}>{t(K.label)}</span>
        <span style={{ fontSize: 11, padding: "2px 9px", borderRadius: 999, color: v2.amber, border: `1px solid ${v2.amber}55` }}>{t(K.example)}</span>
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 18 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: hypothesis, marginTop: 7, flexShrink: 0 }} />
        <div style={{ fontSize: 17, fontWeight: 600, lineHeight: 1.4, color: v2.t1, overflowWrap: "anywhere" }}>{t(K.idea)}</div>
      </div>
      <div style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12, color: v2.t3, marginBottom: 8 }}>
          <span>{t(K.maturity)}</span>
          {range && level !== null && <span style={{ color: v2.teal, fontWeight: 600 }}>{t(K.level, { level, max: range.max })}</span>}
        </div>
        <div style={{ display: "flex", gap: 5 }}>
          {range
            ? levels.map(l => <span key={l} style={{ flex: 1, height: 8, borderRadius: 4, background: level !== null && l <= level ? v2.teal : "rgba(255,255,255,0.08)" }} />)
            : <span style={{ flex: 1, height: 8, borderRadius: 4, background: "rgba(255,255,255,0.08)" }} />}
        </div>
      </div>
      <div style={{ display: "grid", gap: 10, paddingTop: 16, borderTop: `1px solid ${v2.bd}` }}>
        <div style={row}><span style={{ ...rowLabel, color: TYPE_COLORS.observation }}>{t(K.support)}</span><span style={{ color: v2.t2, minWidth: 0, overflowWrap: "anywhere" }}>{t(K.supportText)}</span></div>
        <div style={row}><span style={{ ...rowLabel, color: v2.amber }}>{t(K.blind)}</span><span style={{ color: v2.t2, minWidth: 0, overflowWrap: "anywhere" }}>{t(K.blindText)}</span></div>
        <div style={row}><span style={{ ...rowLabel, color: TYPE_COLORS.prediction }}>{t(K.forecast)}</span><span style={{ color: v2.t2, minWidth: 0, overflowWrap: "anywhere" }}>{t(K.forecastText)}</span></div>
        <div style={{ ...row, justifyContent: "flex-end", color: v2.t3 }}>{t(K.confidence, { pct: EXAMPLE.confidence })}</div>
      </div>
      <p style={{ margin: "14px 0 0", fontSize: 11, lineHeight: 1.5, color: v2.t3 }}>{t(K.note)}</p>
    </aside>
  )
}
