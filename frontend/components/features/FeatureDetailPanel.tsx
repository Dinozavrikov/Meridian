"use client"
import { useT } from "@/lib/i18n/useT"
import { NODE_BY_KEY, groupAccent, groupLabelKey, neighbors, type NodeKey } from "@/lib/features-map"
import type { FeatureMetric } from "@/lib/use-personal-feature-metrics"
import { v2 } from "@/lib/theme"

interface Props { selected: NodeKey; metric: FeatureMetric | null; onSelect: (key: NodeKey) => void }

export function FeatureDetailPanel({ selected, metric, onSelect }: Props) {
  const t = useT()
  const node = NODE_BY_KEY[selected]
  const near = neighbors(selected)
  return (
    <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))", gap: 32, padding: "28px 32px", background: v2.surf, border: `1px solid ${v2.bd}`, borderRadius: 14 }}>
      <div>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 14, fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: v2.t3 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: node.color }} />
          {t(groupLabelKey(node.group))}
        </div>
        <h3 style={{ margin: "0 0 10px", fontSize: 24, fontWeight: 600, letterSpacing: "-0.02em", color: v2.t1 }}>{t(node.nameKey)}</h3>
        <p style={{ margin: 0, maxWidth: 560, fontSize: 15, lineHeight: 1.7, color: v2.t2 }}>{t(node.textKey)}</p>
        {metric && (
          <div style={{ marginTop: 16, fontSize: 13, color: v2.t3 }}>
            {t(metric.labelKey)}: <span style={{ color: groupAccent(node.group), fontWeight: 600 }}>{metric.value}</span>
          </div>
        )}
        {node.href && <a className="feat-link" href={node.href} style={{ display: "inline-block", marginTop: 16, fontSize: 14 }}>{t("featuresPage.panel.open")} →</a>}
      </div>
      {near.length > 0 && (
        <div>
          <div style={{ marginBottom: 14, fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: v2.t4 }}>{t("featuresPage.panel.with")}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {near.map(k => (
              <button key={k} type="button" className="feat-chip" onClick={() => onSelect(k)} style={{ "--node-color": NODE_BY_KEY[k].color } as React.CSSProperties}>
                <span className="feat-dot" />
                {t(NODE_BY_KEY[k].nameKey)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
