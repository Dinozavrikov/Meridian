"use client"
import { Fragment } from "react"
import { useT } from "@/lib/i18n/useT"
import { useIsMobile } from "@/lib/use-is-mobile"
import { NODE_BY_KEY, TRACKS } from "@/lib/features-map"
import { v2 } from "@/lib/theme"
import { Tooltip } from "@/components/ui/tooltip"
import { FeatureSectionHead } from "./FeatureSectionHead"

const TRACK_ACCENT: Record<(typeof TRACKS)[number]["key"], string> = { curiosity: v2.teal, research: v2.amber }

export function FeatureTracks() {
  const t = useT()
  const mobile = useIsMobile(720)
  return (
    <section style={{ marginBottom: 88 }}>
      <FeatureSectionHead title={t("featuresPage.tracks.title")} lead={t("featuresPage.tracks.lead")} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))", gap: 16 }}>
        {TRACKS.map(tr => (
          <div key={tr.key} data-track={tr.key} style={{ padding: "26px 28px", background: v2.surf, border: `1px solid ${v2.bd}`, borderRadius: 14 }}>
            <div style={{ marginBottom: 12, fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: TRACK_ACCENT[tr.key] }}>{t(`featuresPage.track.${tr.key}.label`)}</div>
            <div style={{ marginBottom: 20, fontSize: 20, fontWeight: 600, lineHeight: 1.35, letterSpacing: "-0.015em", color: v2.t1 }}>{t(`featuresPage.track.${tr.key}.q`)}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              {tr.steps.map((k, i) => {
                const chip = (
                  <span data-step={`${tr.key}:${k}`} className={mobile ? "feat-chip" : "feat-chip feat-tip"} tabIndex={mobile ? undefined : 0}
                    style={{ "--node-color": NODE_BY_KEY[k].color, cursor: mobile ? "default" : "help" } as React.CSSProperties}>
                    <span className="feat-dot" />
                    {t(NODE_BY_KEY[k].nameKey)}
                  </span>
                )
                return (
                  <Fragment key={k}>
                    {mobile ? chip : <Tooltip text={t(`featuresPage.track.${tr.key}.${k}.hint`)}
                        card={{ title: t(NODE_BY_KEY[k].nameKey), eyebrow: t(`featuresPage.track.${tr.key}.label`), accent: NODE_BY_KEY[k].color }}>{chip}</Tooltip>}
                    {i < tr.steps.length - 1 && <span aria-hidden="true" style={{ color: v2.t4 }}>→</span>}
                  </Fragment>
                )
              })}
            </div>
            {mobile && (
              <ol style={{ margin: "20px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 12 }}>
                {tr.steps.map(k => (
                  <li key={k}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: NODE_BY_KEY[k].color }}>{t(NODE_BY_KEY[k].nameKey)}</div>
                    <div style={{ marginTop: 2, fontSize: 12.5, lineHeight: 1.5, color: v2.t3 }}>{t(`featuresPage.track.${tr.key}.${k}.hint`)}</div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
