"use client"
import { api } from "@/lib/api"
import { useTranslatedListQuery } from "@/lib/i18n/use-translated-query"
import { Ruler } from "@/components/ui/ruler"
import { DEFAULT_SCALES } from "@/lib/scales"
import { Check, Info } from "lucide-react"
import { v2 } from "@/lib/theme"
import { useT } from "@/lib/i18n/useT"
import { useDynamicTranslate } from "@/lib/i18n/useDynamicT"
import { collectStrings } from "@/lib/i18n/collect-strings"

const MATURITY_SCALE   = DEFAULT_SCALES.find(s => s.id === "maturity"   && s.entity_type === "hypothesis")!
const STABILITY_SCALE  = DEFAULT_SCALES.find(s => s.id === "stability"  && s.entity_type === "hypothesis")!
const RISK_SCALE       = DEFAULT_SCALES.find(s => s.id === "risk"       && s.entity_type === "hypothesis")!

interface LabCompareTabProps {
  parentType: "task" | "question"
  parentId: number
  focusedId: number | null
  onFocus: (id: number | null) => void
  onPreview: (id: number) => void
}

export function LabCompareTab({ parentType, parentId, focusedId, onFocus, onPreview }: LabCompareTabProps) {
  const t = useT()
  const dt = useDynamicTranslate(collectStrings(DEFAULT_SCALES))
  const { data: competition = [] } = useTranslatedListQuery(
    [parentType, "competition", parentId],
    () => api.get(`/api/v1/${parentType}s/${parentId}/competition`).then(r => r.data),
    "hypothesis",
    ["name"],
    { staleTime: 0, refetchOnMount: "always" },
  )

  if (competition.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "48px 0", color: v2.t3, fontSize: 13 }}>
        {t("labCompareTab.empty")}
      </div>
    )
  }

  return (
    <div>
      <p style={{ fontSize: 12.5, color: v2.t3, lineHeight: 1.6, margin: "0 0 20px", maxWidth: 640 }}>
        {t("labCompareTab.intro")}
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(280px, 100%), 1fr))", gap: 12 }}>
        {competition.map((h: any) => {
          const focused = focusedId === h.id
          const total = h.confirming + h.refuting
          const autoPct = total > 0 ? Math.round((h.confirming / total) * 100) : 50
          return (
            <div key={h.id} onClick={() => onFocus(focused ? null : h.id)}
              style={{
                background: v2.bg, borderRadius: 12, padding: 16, cursor: "pointer",
                border: `1px solid ${focused ? MATURITY_SCALE.color : v2.bd}`,
                boxShadow: focused ? `0 0 0 1px ${MATURITY_SCALE.color}` : "none",
                transition: "border-color 0.12s, box-shadow 0.12s",
              }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 6, marginBottom: 12 }}>
                <div style={{ flex: 1, fontSize: 13, color: v2.t1, lineHeight: 1.4, minHeight: 36 }}>{h.name}</div>
                <button onClick={e => { e.stopPropagation(); onPreview(h.id) }}
                  style={{ flexShrink: 0, display: "flex", padding: 3, borderRadius: 5, border: "none", background: "transparent", color: v2.t3, cursor: "pointer" }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = MATURITY_SCALE.color}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = v2.t3}>
                  <Info size={13} />
                </button>
              </div>

              <div style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, color: v2.t3, marginBottom: 5, textTransform: "uppercase" }}>
                  <span>{dt(MATURITY_SCALE.name)}</span><span style={{ color: MATURITY_SCALE.color }}>{h.maturity}/{MATURITY_SCALE.max}</span>
                </div>
                <Ruler variant="compact" name={dt(MATURITY_SCALE.name)} value={h.maturity} min={MATURITY_SCALE.min} max={MATURITY_SCALE.max}
                  levels={MATURITY_SCALE.levels} color={MATURITY_SCALE.color} hideLabel />
              </div>
              <div style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, color: v2.t3, marginBottom: 5, textTransform: "uppercase" }}>
                  <span>{dt(STABILITY_SCALE.name)}</span><span style={{ color: STABILITY_SCALE.color }}>{h.stability}/{STABILITY_SCALE.max}</span>
                </div>
                <Ruler variant="compact" name={dt(STABILITY_SCALE.name)} value={h.stability} min={STABILITY_SCALE.min} max={STABILITY_SCALE.max}
                  levels={STABILITY_SCALE.levels} color={STABILITY_SCALE.color} hideLabel />
              </div>
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, color: v2.t3, marginBottom: 5, textTransform: "uppercase" }}>
                  <span>{dt(RISK_SCALE.name)}</span><span style={{ color: RISK_SCALE.color }}>{h.risk}/{RISK_SCALE.max}</span>
                </div>
                <Ruler variant="compact" name={dt(RISK_SCALE.name)} value={h.risk} min={RISK_SCALE.min} max={RISK_SCALE.max}
                  levels={RISK_SCALE.levels} color={RISK_SCALE.color} hideLabel />
              </div>

              <div style={{ paddingTop: 14, borderTop: `1px dashed ${v2.bd2}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, color: v2.t3, marginBottom: 6, textTransform: "uppercase" }}>
                  <Check size={11} style={{ color: v2.teal }} />
                  {t("labCompareTab.autoLabel")}
                </div>
                <div style={{ position: "relative", height: 8, borderRadius: 4, background: v2.bd2, overflow: "hidden", marginBottom: 6 }}>
                  <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${autoPct}%`, borderRadius: 4, background: `linear-gradient(90deg, ${v2.red}, ${v2.teal})` }} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 10, color: v2.t3 }}>
                  <span><b style={{ color: v2.t1 }}>{h.confirming}</b> {t("labCompareTab.confirming")}</span>
                  <span><b style={{ color: v2.t1 }}>{h.refuting}</b> {t("labCompareTab.refuting")}</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
