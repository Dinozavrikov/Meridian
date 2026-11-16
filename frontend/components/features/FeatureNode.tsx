"use client"
import { useT } from "@/lib/i18n/useT"
import { VIEW_W, type MapNode, type NodeKey } from "@/lib/features-map"

export type NodeState = "selected" | "related" | "dim"

export function FeatureNode({ node, state, onSelect }: { node: MapNode; state: NodeState; onSelect: (key: NodeKey) => void }) {
  const t = useT()
  return (
    <button
      type="button"
      className="feat-node"
      data-node={node.key}
      data-state={state}
      aria-pressed={state === "selected"}
      onClick={() => onSelect(node.key)}
      style={{ left: `${(node.x / VIEW_W) * 100}%`, top: node.y, "--node-color": node.color } as React.CSSProperties}
    >
      <span className="feat-dot" />
      {t(node.nameKey)}
    </button>
  )
}
