import type { ForceGraphNode, ForceGraphEdge } from "@/components/graph/force-graph"

/** Узел из ответа /api/v1/graph (личный и лабораторный) -> узел ForceGraph. Единственное место сборки. */
export function toForceGraphNode(n: any): ForceGraphNode {
  return { id: n.id, label: n.label, type: n.type, entityId: n.eid, date: n.date, opened: n.opened === true ? true : undefined }
}

/** Локальный граф карточки сущности: центр + связанные записи из /graph/related + упоминания в тексте (ребро mention, без типа связи). */
export function buildLocalGraphData(data: any, entityType: string, entityId: number, entityTitle: string | undefined) {
  const all: any[] = Object.values(data?.related || {}).flat()
  // запись, уже ставшая узлом (связь или второе упоминание), второго узла не получает;
  // связь остаётся обычным ребром, упоминание поверх неё не рисуется
  const seen = new Set<string>(all.map(item => `${item.type}-${item.id}`))
  const mentionItems: any[] = []
  for (const m of [...(data?.mentions?.mentions ?? []), ...(data?.mentions?.mentioned_in ?? [])]) {
    const id = `${m.type}-${m.id}`
    if (seen.has(id)) continue
    seen.add(id)
    mentionItems.push(m)
  }
  const centerId = `center`
  const baseNodes: ForceGraphNode[] = [
    { id: centerId, label: entityTitle ?? "", type: entityType, entityId, isCenter: true },
    ...all.map(item => ({
      id: `${item.type}-${item.id}`,
      label: item.title ?? "",
      type: item.type,
      entityId: item.id,
      linkType: item.link_type,
      status: item.status ?? null,
      // у прогноза в date дата проверки, а не события: в тултипе только у наблюдений
      date: item.type === "observation" ? item.date : undefined,
    })),
  ]
  const edges: ForceGraphEdge[] = all.map(item => {
    const parentNodeId = item.parent_type && item.parent_id ? `${item.parent_type}-${item.parent_id}` : null
    const hasParentInGraph = parentNodeId && all.some(x => x.type === item.parent_type && x.id === item.parent_id)
    return {
      source: hasParentInGraph ? parentNodeId! : centerId,
      target: `${item.type}-${item.id}`,
      linkType: item.link_type,
    }
  })
  const mentionNodes: ForceGraphNode[] = mentionItems.map(m => ({
    id: `${m.type}-${m.id}`, label: m.title ?? "", type: m.type, entityId: m.id, status: m.status ?? null,
  }))
  const mentionEdges: ForceGraphEdge[] = mentionItems.map(m => ({ source: centerId, target: `${m.type}-${m.id}`, mention: true }))
  return { nodes: [...baseNodes, ...mentionNodes], edges: [...edges, ...mentionEdges] }
}
