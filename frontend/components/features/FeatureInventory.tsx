"use client"
import { useT } from "@/lib/i18n/useT"
import { useIsMobile } from "@/lib/use-is-mobile"
import { GROUP_KEYS, INVENTORY, groupAccent, groupLabelKey } from "@/lib/features-map"
import { v2 } from "@/lib/theme"
import { Tooltip } from "@/components/ui/tooltip"
import { FeatureSectionHead } from "./FeatureSectionHead"

const pad = (n: number) => String(n).padStart(2, "0")

export function FeatureInventory() {
  const t = useT()
  const mobile = useIsMobile(720)
  return (
    <section>
      <FeatureSectionHead title={t("featuresPage.inventory.title")} lead={t("featuresPage.inventory.lead")} />
      <div>
        {GROUP_KEYS.map(g => {
          const accent = groupAccent(g)
          return (
            <div key={g} data-group={g} className="feat-inv-row" style={{ "--tile-color": accent } as React.CSSProperties}>
              <div className="feat-inv-head">
                <span className="feat-inv-count" style={{ color: accent }}>{pad(INVENTORY[g].length)}</span>
                <span style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.01em", color: v2.t1 }}>{t(groupLabelKey(g))}</span>
              </div>
              <div className="feat-inv-grid">
                {INVENTORY[g].map(item => {
                  const hint = t(`featuresPage.inv.${item}.hint`)
                  const name = t(`featuresPage.inv.${item}.name`)
                  const tile = (
                    <div data-inv={item} className="feat-inv-tile" tabIndex={mobile ? undefined : 0}>
                      <span style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.3, color: v2.t1 }}>{name}</span>
                      <span style={{ fontSize: 12.5, lineHeight: 1.55, color: v2.t3 }}>{mobile ? hint : t(`featuresPage.inv.${item}.text`)}</span>
                    </div>
                  )
                  return mobile
                    ? <div key={item} style={{ display: "flex" }}>{tile}</div>
                    : <Tooltip key={item} text={hint} fullWidth card={{ title: name, eyebrow: t(groupLabelKey(g)), accent }}>{tile}</Tooltip>
                })}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
