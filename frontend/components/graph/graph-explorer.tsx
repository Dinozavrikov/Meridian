"use client"
import { useMemo, useState } from "react"
import { ForceGraph, type ForceGraphNode, type ForceGraphEdge } from "@/components/graph/force-graph"
import { typeColor, theme } from "@/lib/theme"
import { useTypeRu } from "@/lib/i18n/useTypeRu"
import { useT } from "@/lib/i18n/useT"
import { EDGE_LEGEND } from "@/lib/graph-visuals"
import { influenceLegendFor } from "@/lib/worldview-influence"

export interface GraphExplorerProps {
  nodes: ForceGraphNode[]
  edges: ForceGraphEdge[]
  types: string[]
  typeCounts?: Record<string, number>
  allLabel?: string
  truncated?: boolean
  truncatedLabel?: string
  /** переопределяет цвет узла (режимы «а что, если» и «слепые зоны») */
  colorForNode?: (node: ForceGraphNode) => string
  emphasis?: (node: ForceGraphNode) => "on" | "off" | undefined
  /** панель над графом (переключатель режимов) */
  toolbar?: React.ReactNode
  isLoading?: boolean
  loadingLabel?: string
  emptyLabel?: string
  shapes?: boolean
  fixedCenter?: boolean
  nodeRadius?: number
  centerRadius?: number
  onNodeClick?: (node: ForceGraphNode) => void
  renderPreview?: (node: ForceGraphNode, onClose: () => void) => React.ReactNode
  showEdgeLegend?: boolean
}

export function GraphExplorer({
  nodes, edges, types, typeCounts, allLabel,
  truncated, truncatedLabel, isLoading, loadingLabel, colorForNode, emphasis, toolbar,
  emptyLabel,
  shapes = false, fixedCenter = false, nodeRadius, centerRadius,
  onNodeClick, renderPreview, showEdgeLegend = true,
}: GraphExplorerProps) {
  const t = useT()
  const typeRu = useTypeRu()
  const [activeType, setActiveType] = useState<string | null>(null)
  const [selected, setSelected] = useState<ForceGraphNode | null>(null)

  const effectiveAllLabel = allLabel ?? t("graphExplorer.allEdges")
  const effectiveLoadingLabel = loadingLabel ?? t("graphExplorer.loading")
  const effectiveEmptyLabel = emptyLabel ?? t("graphExplorer.empty")
  const effectiveTruncatedLabel = truncatedLabel ?? t("graphExplorer.truncated", { n: nodes.length })

  const computedCounts = useMemo(() => {
    if (typeCounts) return typeCounts
    const c: Record<string, number> = {}
    nodes.forEach(n => { c[n.type] = (c[n.type] ?? 0) + 1 })
    return c
  }, [nodes, typeCounts])

  const filtered = useMemo(() => {
    if (!activeType) return { nodes, edges }
    const ids = new Set(nodes.filter(n => n.type === activeType).map(n => n.id))
    return {
      nodes: nodes.filter(n => ids.has(n.id)),
      edges: edges.filter(e => ids.has(e.source) && ids.has(e.target)),
    }
  }, [nodes, edges, activeType])

  const handleNodeClick = (n: ForceGraphNode) => {
    onNodeClick?.(n)
    if (renderPreview) setSelected(n)
  }

  const chipStyle = (isActive: boolean, color: string): React.CSSProperties => ({
    display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 500,
    padding: "6px 12px 6px 10px", borderRadius: 20,
    border: `1px solid ${isActive ? color : theme.ln2}`,
    background: isActive ? `${color}24` : "transparent",
    color: isActive ? color : theme.tx3, cursor: "pointer", whiteSpace: "nowrap",
  })

  if (isLoading) return <div style={{ padding: 60, textAlign: "center", color: theme.tx4, fontSize: 13 }}>{effectiveLoadingLabel}</div>
  if (nodes.length === 0) return <div style={{ padding: 60, textAlign: "center", color: theme.tx4, fontSize: 13 }}>{effectiveEmptyLabel}</div>

  return (
    <div style={{ height: "100%", minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "12px 16px", borderBottom: `1px solid ${theme.ln1}`, overflowX: "auto" }}>
        <button onClick={() => setActiveType(null)} style={chipStyle(activeType === null, theme.tx1)}>
          {effectiveAllLabel} <span style={{ fontFamily: theme.mono, fontSize: 10, opacity: 0.6 }}>{nodes.length}</span>
        </button>
        {types.map(tp => (
          <button key={tp} onClick={() => setActiveType(tp)} style={chipStyle(activeType === tp, (typeColor as any)[tp] ?? "#888")}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: (typeColor as any)[tp] ?? "#888" }} />
            {typeRu[tp] ?? tp} <span style={{ fontFamily: theme.mono, fontSize: 10, opacity: 0.6 }}>{computedCounts[tp] ?? 0}</span>
          </button>
        ))}
        {truncated && (
          <span style={{ marginLeft: "auto", fontSize: 10.5, color: theme.tx4, fontFamily: theme.mono, flexShrink: 0 }}>
            {effectiveTruncatedLabel}
          </span>
        )}
      </div>
      {toolbar}
      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
        <ForceGraph
          nodes={filtered.nodes}
          edges={filtered.edges}
          shapes={shapes}
          fixedCenter={fixedCenter}
          nodeRadius={nodeRadius}
          centerRadius={centerRadius}
          onNodeClick={handleNodeClick}
          colorForNode={colorForNode}
          emphasis={emphasis}
        />
      </div>
      {showEdgeLegend && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px", padding: "8px 16px", borderTop: `1px solid ${theme.ln1}`, flexShrink: 0 }}>
          {[...EDGE_LEGEND, ...influenceLegendFor(filtered.edges)].map(([c, labelKey]) => (
            <div key={labelKey} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ width: 16, height: 2, background: c, borderRadius: 1, opacity: 0.8 }} />
              <span style={{ fontSize: 9, color: theme.tx3 }}>{t(labelKey)}</span>
            </div>
          ))}
        </div>
      )}
      {selected && renderPreview && renderPreview(selected, () => setSelected(null))}
    </div>
  )
}
