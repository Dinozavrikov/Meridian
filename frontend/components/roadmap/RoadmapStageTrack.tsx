"use client"
import { useT } from "@/lib/i18n/useT"
import { STAGE_VALUES, stageLabel, type StageValue } from "@/lib/stage-labels"
import { ACCENT } from "@/lib/utils"
import { v2 } from "@/lib/theme"
import { pad2, stageIndex } from "@/lib/roadmap"
import { Tooltip } from "@/components/ui/tooltip"

/** Трек из 8 стадий пути (тот же, что у записей): пройденные деления закрашены, текущее подписано. */
export function RoadmapStageTrack({ stage }: { stage: StageValue }) {
  const t = useT()
  const at = stageIndex(stage)
  const last = STAGE_VALUES.length - 1
  const toneAt = (i: number) => `color-mix(in srgb, ${v2.amber} ${Math.round((i / last) * 100)}%, ${ACCENT})`
  return (
    <div data-stage-track={stage} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: v2.t4 }}>{t("roadmapPage.stage.caption")}</span>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: toneAt(at) }}>{stageLabel(t, stage)}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${STAGE_VALUES.length}, 1fr)`, gap: 4 }}>
        {STAGE_VALUES.map((s, i) => (
          <Tooltip key={s} fullWidth text={t(`featuresPage.stageHint.${s}`)}
            card={{ title: stageLabel(t, s), eyebrow: `${pad2(i + 1)} / ${pad2(STAGE_VALUES.length)}`, accent: toneAt(i) }}>
            <span data-seg={s} data-reached={i <= at} data-current={i === at} tabIndex={0} className="road-seg"
              style={{ flex: 1, height: 8, borderRadius: 4, background: i <= at ? toneAt(i) : v2.bd2, opacity: i < at ? 0.7 : 1 }} />
          </Tooltip>
        ))}
      </div>
    </div>
  )
}
