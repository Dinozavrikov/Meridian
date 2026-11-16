"use client"
import { useT } from "@/lib/i18n/useT"
import { useIsMobile } from "@/lib/use-is-mobile"
import {
  GROUP_KEYS, NODES, NODE_BY_KEY, VIEW_H, groupAccent, groupLabelKey, membersOf, neighbors, type LegendKey, type NodeKey,
} from "@/lib/features-map"
import { FeatureEdges } from "./FeatureEdges"
import { FeatureNode, type NodeState } from "./FeatureNode"

interface Props { selected: NodeKey; showAll: boolean; onSelect: (key: NodeKey) => void; highlight?: LegendKey | null }

export function FeatureMap({ selected, showAll, onSelect, highlight = null }: Props) {
  const t = useT()
  const mobile = useIsMobile(720)
  const near = new Set<NodeKey>(neighbors(selected))
  const stateOf = (k: NodeKey): NodeState => (k === selected ? "selected" : near.has(k) ? "related" : "dim")

  if (mobile) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {GROUP_KEYS.map(g => (
          <div key={g}>
            <div className="feat-colhead feat-colhead--static" style={{ color: groupAccent(g) }}>{t(groupLabelKey(g))}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {membersOf(g).map(k => (
                <button key={k} type="button" className="feat-chip" data-node={k} data-state={stateOf(k)}
                  aria-pressed={k === selected} onClick={() => onSelect(k)}
                  style={{ "--node-color": NODE_BY_KEY[k].color } as React.CSSProperties}>
                  <span className="feat-dot" />
                  {t(NODE_BY_KEY[k].nameKey)}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="feat-map-scroll">
      <div className="feat-map" style={{ height: VIEW_H }}>
        <FeatureEdges selected={selected} showAll={showAll} highlight={highlight} />
        {GROUP_KEYS.map((g, i) => (
          <div key={g} className="feat-colhead" style={{ left: `${((i + 0.5) / GROUP_KEYS.length) * 100}%` }}>{t(groupLabelKey(g))}</div>
        ))}
        {NODES.map(n => <FeatureNode key={n.key} node={n} state={stateOf(n.key)} onSelect={onSelect} />)}
      </div>
    </div>
  )
}
