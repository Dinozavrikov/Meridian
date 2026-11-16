"use client"
import { useT } from "@/lib/i18n/useT"
import { ruPluralForm } from "@/lib/i18n/ru-plural"
import { MEMBERS, NODE_BY_KEY, featureStats } from "@/lib/features-map"
import { STAGE_VALUES, stageLabel } from "@/lib/stage-labels"
import { getVisibilityOptions } from "@/lib/visibility-levels"
import { v2 } from "@/lib/theme"

const FORM_SUFFIX = { one: "One", few: "Few", many: "Many" } as const
/** Название плитки согласуется с числом: «1 тип записи», «2 типа записей», «5 типов записей». */
const counted = (t: (k: string) => string, base: string, n: number) => t(`featuresPage.stat.${base}${FORM_SUFFIX[ruPluralForm(n)]}`)

const lower = (x: string) => x.charAt(0).toLowerCase() + x.slice(1)

export function FeatureStats() {
  const t = useT()
  const s = featureStats()
  const first = lower(stageLabel(t, STAGE_VALUES[0]))
  const last = lower(stageLabel(t, STAGE_VALUES[STAGE_VALUES.length - 1]))
  const tiles = [
    { n: s.recordTypes, label: counted(t, "records", s.recordTypes), desc: MEMBERS.records.map(k => lower(t(NODE_BY_KEY[k].nameKey))).join(", ") },
    { n: s.linkKinds, label: counted(t, "links", s.linkKinds), desc: t("featuresPage.stat.links.desc") },
    { n: s.stages, label: counted(t, "stages", s.stages), desc: `${t("featuresPage.range.from")} «${first}» ${t("featuresPage.range.to")} «${last}»` },
    { n: s.visibilityLevels, label: counted(t, "visibility", s.visibilityLevels), desc: getVisibilityOptions(t).map(o => lower(o.label)).join(" · ") },
  ]
  return (
    <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 230px), 1fr))", gap: 1, background: v2.bd, border: `1px solid ${v2.bd}`, borderRadius: 14, overflow: "hidden", marginBottom: 88 }}>
      {tiles.map(x => (
        <div key={x.label} style={{ background: v2.bg, padding: "22px 24px" }}>
          <div style={{ fontSize: 36, fontWeight: 600, letterSpacing: "-0.03em", lineHeight: 1, color: v2.t1 }}>{x.n}</div>
          <div style={{ marginTop: 10, fontSize: 14, fontWeight: 500, color: v2.t1 }}>{x.label}</div>
          <div style={{ marginTop: 4, fontSize: 12.5, lineHeight: 1.5, color: v2.t3 }}>{x.desc}</div>
        </div>
      ))}
    </section>
  )
}
