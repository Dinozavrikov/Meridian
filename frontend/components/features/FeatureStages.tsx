"use client"
import { useT } from "@/lib/i18n/useT"
import { useIsMobile } from "@/lib/use-is-mobile"
import { STAGE_VALUES, stageLabel } from "@/lib/stage-labels"
import { ACCENT } from "@/lib/utils"
import { v2 } from "@/lib/theme"
import { Tooltip } from "@/components/ui/tooltip"
import { FeatureSectionHead } from "./FeatureSectionHead"

const pad = (n: number) => String(n).padStart(2, "0")

export function FeatureStages() {
  const t = useT()
  const mobile = useIsMobile(720)
  const last = STAGE_VALUES.length - 1
  return (
    <section style={{ marginBottom: 88 }}>
      <FeatureSectionHead title={t("featuresPage.stages.title")} lead={t("featuresPage.stages.lead")} />
      <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 130px), 1fr))", gap: 10 }}>
        {STAGE_VALUES.map((s, i) => {
          const tone = `color-mix(in srgb, ${v2.amber} ${last ? Math.round((i / last) * 100) : 0}%, ${ACCENT})`
          const hint = t(`featuresPage.stageHint.${s}`)
          const card = (
            <div data-stage={s} className={mobile ? undefined : "feat-tip"} tabIndex={mobile ? undefined : 0}
              style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "space-between", minHeight: 92, padding: "16px 14px", boxSizing: "border-box", background: v2.surf, border: `1px solid ${v2.bd}`, borderTop: `2px solid ${tone}`, borderRadius: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.08em", color: tone }}>{String(i + 1).padStart(2, "0")}</span>
              <span style={{ marginTop: 14, fontSize: 14, fontWeight: 500, lineHeight: 1.3, color: v2.t1 }}>{stageLabel(t, s)}</span>
              {mobile && <span style={{ marginTop: 8, fontSize: 12.5, lineHeight: 1.5, color: v2.t3 }}>{hint}</span>}
            </div>
          )
          return (
            <li key={s} style={{ display: "flex" }}>
              {mobile ? card : (
                <Tooltip text={hint} fullWidth card={{ title: stageLabel(t, s), eyebrow: `${pad(i + 1)} / ${pad(STAGE_VALUES.length)}`, accent: tone }}>{card}</Tooltip>
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
