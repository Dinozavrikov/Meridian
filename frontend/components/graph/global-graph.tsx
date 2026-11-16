"use client"
import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { globalGraphApi } from "@/lib/api"
import { GraphExplorer } from "@/components/graph/graph-explorer"
import { EntityPreviewModal } from "@/components/entities/entity-preview-modal"
import { useGraphInsights } from "@/components/graph/use-graph-insights"
import type { ForceGraphNode, ForceGraphEdge } from "@/components/graph/force-graph"
import { useT } from "@/lib/i18n/useT"

const TYPES = ["hypothesis", "observation", "prediction", "worldview", "question", "task"]

export function GlobalGraph() {
  const t = useT()
  const { data, isLoading } = useQuery({ queryKey: ["global-graph", "all"], queryFn: globalGraphApi.all })
  const known = useMemo(() => new Set<string>((data?.nodes ?? []).map((n: any) => n.id)), [data])
  const insights = useGraphInsights({ global: true, knownIds: known })

  const nodes: ForceGraphNode[] = (data?.nodes ?? []).map((n: any) => ({
    id: n.id, label: n.label, type: n.type, entityId: n.entity_id,
  }))
  const edges: ForceGraphEdge[] = (data?.edges ?? []).map((e: any) => ({
    source: e.from, target: e.to, linkType: e.link_type,
  }))

  return (
    <GraphExplorer
      nodes={nodes}
      edges={edges}
      types={TYPES}
      typeCounts={data?.type_counts}
      truncated={data?.truncated}
      isLoading={isLoading}
      loadingLabel={t("graphExplorer.loading")}
      emptyLabel={t("graphPage.globalEmpty")}
      shapes={false}
      toolbar={insights.toolbar}
      colorForNode={insights.colorForNode}
      emphasis={insights.emphasis}
      onNodeClick={insights.onNodeClick}
      renderPreview={insights.previewEnabled ? (node, onClose) => (
        <EntityPreviewModal type={node.type} id={node.entityId} onClose={onClose} />
      ) : undefined}
    />
  )
}
