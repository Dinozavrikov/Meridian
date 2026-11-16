"use client"
import { useState } from "react"
import { useSearchParams } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { graphApi } from "@/lib/api"
import { Header } from "@/components/layout/header"
import { GlobalGraph } from "@/components/graph/global-graph"
import { GraphExplorer } from "@/components/graph/graph-explorer"
import type { ForceGraphNode, ForceGraphEdge } from "@/components/graph/force-graph"
import { toForceGraphNode } from "@/lib/graph-data"
import { useGraphInsights } from "@/components/graph/use-graph-insights"
import { EntityPreviewModal } from "@/components/entities/entity-preview-modal"
import { ScopeToggle } from "@/components/ui/scope-toggle"
import { useT } from "@/lib/i18n/useT"

const TYPES = ["hypothesis", "observation", "prediction", "worldview", "question", "task"]

function PersonalGraph() {
  const t = useT()
  const { data, isLoading } = useQuery({ queryKey: ["graph"], queryFn: graphApi.get })
  const insights = useGraphInsights()

  const nodes: ForceGraphNode[] = (data?.nodes ?? []).map(toForceGraphNode)
  const edges: ForceGraphEdge[] = (data?.edges ?? []).map((e: any) => ({
    source: e.from, target: e.to, linkType: e.link_type,
  }))

  return (
    <GraphExplorer
      nodes={nodes}
      edges={edges}
      types={TYPES}
      allLabel={t("graphPage.allNodesLabel")}
      isLoading={isLoading}
      loadingLabel={t("graphExplorer.loading")}
      emptyLabel={t("graphPage.personalEmpty")}
      shapes={false}
      toolbar={insights.toolbar}
      colorForNode={insights.colorForNode}
      emphasis={insights.emphasis}
      onNodeClick={insights.onNodeClick}
      renderPreview={insights.previewEnabled ? (node, onClose) => (
        <EntityPreviewModal type={node.type} id={node.entityId} onClose={onClose} openRecord />
      ) : undefined}
    />
  )
}

export default function GraphPage() {
  const searchParams = useSearchParams()
  const t = useT()
  const [scope, setScope] = useState<"personal" | "global">(searchParams.get("scope") === "global" ? "global" : "personal")

  return (
    <div className="flex flex-col h-screen">
      <Header titleKey="page.graph.title" actions={
        <ScopeToggle
          value={scope}
          onChange={setScope}
          options={[
            { value: "personal", label: t("page.graph.scope.personal") },
            { value: "global", label: t("page.graph.scope.global") },
          ]}
        />
      } />
      <div className="flex-1 relative">
        {scope === "global" ? <GlobalGraph /> : <PersonalGraph />}
      </div>
    </div>
  )
}
