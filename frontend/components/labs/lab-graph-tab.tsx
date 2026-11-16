"use client"
import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Maximize2, Minimize2 } from "lucide-react"
import { graphApi } from "@/lib/api"
import { theme } from "@/lib/theme"
import { GraphExplorer } from "@/components/graph/graph-explorer"
import { EntityPreviewModal } from "@/components/entities/entity-preview-modal"
import type { ForceGraphNode, ForceGraphEdge } from "@/components/graph/force-graph"
import { toForceGraphNode } from "@/lib/graph-data"
import { useT } from "@/lib/i18n/useT"
import { useGraphInsights } from "@/components/graph/use-graph-insights"

const TYPES = ["hypothesis", "observation", "prediction", "worldview", "question", "task"]

const FS_BTN: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 6, padding: "6px 11px", borderRadius: 7,
  border: "1px solid #2a2a3a", background: "#111420", color: "#9090b0", cursor: "pointer", fontSize: 11.5,
}

export function LabGraphTab({ labId }: { labId: number }) {
  const t = useT()
  const [fullscreen, setFullscreen] = useState(false)
  const [includeOpened, setIncludeOpened] = useState(false)
  const insights = useGraphInsights({ labId })
  const { data, isLoading } = useQuery({
    queryKey: ["graph", "lab", labId, includeOpened],
    queryFn: () => graphApi.lab(labId, { includeOpened }),
  })

  const nodes: ForceGraphNode[] = (data?.nodes ?? []).map(toForceGraphNode)
  const edges: ForceGraphEdge[] = (data?.edges ?? []).map((e: any) => ({
    source: e.from, target: e.to, linkType: e.link_type,
  }))

  const segBtn = (active: boolean): React.CSSProperties => ({
    padding: "5px 10px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 12,
    fontWeight: active ? 600 : 400,
    background: active ? "#1f2436" : "transparent",
    color: active ? theme.tx2 : theme.tx3,
    transition: "background .12s ease, color .12s ease",
  })

  const toolbar = (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
      <div style={{ display: "flex", gap: 2, padding: 3, borderRadius: 8, background: "#141829", border: `1px solid ${theme.ln1}` }}
        role="tablist" aria-label={t("graph.segment.onlyLab")}>
        <button role="tab" aria-selected={!includeOpened} onClick={() => setIncludeOpened(false)} style={segBtn(!includeOpened)}>
          {t("graph.segment.onlyLab")}
        </button>
        <button role="tab" aria-selected={includeOpened} onClick={() => setIncludeOpened(true)} style={segBtn(includeOpened)}>
          {t("graph.segment.withOpened")}
        </button>
      </div>
      <button onClick={() => setFullscreen(f => !f)} style={FS_BTN}>
        {fullscreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
        {t(fullscreen ? "graph.exitFullscreen" : "graph.fullscreen")}
      </button>
    </div>
  )

  const explorer = (
    <GraphExplorer
      nodes={nodes}
      edges={edges}
      types={TYPES}
      allLabel={t("graph.allLabel")}
      isLoading={isLoading}
      loadingLabel={t("graph.loadingLabel")}
      toolbar={insights.toolbar}
      colorForNode={insights.colorForNode}
      emphasis={insights.emphasis}
      onNodeClick={insights.onNodeClick}
      renderPreview={insights.previewEnabled ? (node, onClose) => (
        <EntityPreviewModal type={node.type} id={node.entityId} onClose={onClose} openRecord />
      ) : undefined}
    />
  )

  if (fullscreen) {
    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 500, background: "#0b0d14", display: "flex", flexDirection: "column", padding: "14px 18px", gap: 10 }}>
        {toolbar}
        <div style={{ flex: 1, minHeight: 0 }}>{explorer}</div>
      </div>
    )
  }

  return (
    <div className="p-5" style={{ minHeight: 500 }}>
      {toolbar}
      <div style={{ height: 500 }}>{explorer}</div>
    </div>
  )
}
