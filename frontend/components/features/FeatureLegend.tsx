"use client"
import { useT } from "@/lib/i18n/useT"
import { LEGEND, legendColor, type LegendKey } from "@/lib/features-map"
import { v2 } from "@/lib/theme"

interface Props {
  pinned: LegendKey | null
  onHover: (k: LegendKey | null) => void
  onPin: (k: LegendKey) => void
}

/** Расшифровка цветов линий. Наведение и фокус подсвечивают вид на карте, клик закрепляет подсветку. */
export function FeatureLegend({ pinned, onHover, onPin }: Props) {
  const t = useT()
  return (
    <div role="group" aria-label={t("featuresPage.legend.title")} style={{ marginTop: 18 }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: v2.t4 }}>
        {t("featuresPage.legend.title")}
      </div>
      <div className="feat-legend">
        {LEGEND.map(k => (
          <button key={k} type="button" className="feat-legend-item" data-legend={k} aria-pressed={pinned === k}
            onMouseEnter={() => onHover(k)} onMouseLeave={() => onHover(null)}
            onFocus={() => onHover(k)} onBlur={() => onHover(null)} onClick={() => onPin(k)}
            style={{ "--kind-color": legendColor(k) } as React.CSSProperties}>
            <svg width="48" height="8" aria-hidden="true">
              <line x1="2" y1="4" x2="46" y2="4" stroke={legendColor(k)} strokeWidth="2.5" strokeLinecap="round" strokeDasharray={k === "scope" ? "2 6" : undefined} />
            </svg>
            <span style={{ fontSize: 14, fontWeight: 600, color: v2.t1 }}>{t(`featuresPage.legend.${k}.name`)}</span>
            <span style={{ fontSize: 12.5, lineHeight: 1.5, color: v2.t3 }}>{t(`featuresPage.legend.${k}.text`)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
