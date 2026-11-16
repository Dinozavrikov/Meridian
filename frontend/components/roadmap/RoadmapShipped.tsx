"use client"
import { useT } from "@/lib/i18n/useT"
import { ruPluralForm } from "@/lib/i18n/ru-plural"
import { GROUP_KEYS, NODE_BY_KEY, groupAccent, groupLabelKey, membersOf } from "@/lib/features-map"
import { v2 } from "@/lib/theme"
import { FeatureSectionHead } from "@/components/features/FeatureSectionHead"

const FORM = { one: "One", few: "Few", many: "Many" } as const

/** «Что уже работает» строится из карты функций: добавил функцию там, она появилась здесь. */
export function RoadmapShipped() {
  const t = useT()
  return (
    <section style={{ marginBottom: 88 }}>
      <FeatureSectionHead title={t("roadmapPage.shipped.title")} lead={t("roadmapPage.shipped.lead")} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", gap: 16 }}>
        {GROUP_KEYS.map(g => {
          const keys = membersOf(g)
          const accent = groupAccent(g)
          return (
            <div key={g} data-group={g} style={{ padding: 22, background: v2.surf, border: `1px solid ${v2.bd}`, borderTop: `2px solid ${accent}`, borderRadius: 14 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                <span data-count style={{ fontSize: 34, fontWeight: 600, letterSpacing: "-0.04em", lineHeight: 1, color: accent }}>{keys.length}</span>
                <span style={{ fontSize: 12.5, color: v2.t3 }}>{t(`roadmapPage.shipped.count${FORM[ruPluralForm(keys.length)]}`)}</span>
              </div>
              <div style={{ margin: "10px 0 16px", fontSize: 15, fontWeight: 600, color: v2.t1 }}>{t(groupLabelKey(g))}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {keys.map(k => (
                  <span key={k} className="feat-chip" style={{ "--node-color": NODE_BY_KEY[k].color, cursor: "default" } as React.CSSProperties}>
                    <span className="feat-dot" />
                    {t(NODE_BY_KEY[k].nameKey)}
                  </span>
                ))}
              </div>
            </div>
          )
        })}
      </div>
      <a className="feat-link" href="/features" style={{ display: "inline-block", marginTop: 18, fontSize: 14 }}>{t("roadmapPage.shipped.cta")}</a>
    </section>
  )
}
