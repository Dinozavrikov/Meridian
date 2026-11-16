"use client"
import {
  EDGES, KIND_COLOR, NODE_BY_KEY, SCOPES, SCOPE_COLOR, VIEW_H, VIEW_W, edgePath, groupRail, scopePath,
  type GroupKey, type LegendKey, type NodeKey,
} from "@/lib/features-map"

interface Props { selected: NodeKey; showAll: boolean; highlight?: LegendKey | null }

export function FeatureEdges({ selected, showAll, highlight = null }: Props) {
  const selGroup = NODE_BY_KEY[selected].group
  const railGroups = [...new Set(SCOPES.map(s => s.group))] as GroupKey[]
  // Подсветка вида из легенды важнее выбранного узла: матчинг вида светится, остальное приглушено.
  const stateOf = (kind: LegendKey, live: boolean, base: string) =>
    highlight ? (kind === highlight ? "live" : "dim") : live ? "live" : base
  return (
    <svg className="feat-svg" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="none" aria-hidden="true">
      {railGroups.map(g => {
        const r = groupRail(g)
        const live = highlight ? highlight === "scope" : selGroup === g || SCOPES.some(s => s.group === g && s.from === selected)
        return <rect key={g} className="feat-rail" data-group={g} data-state={live ? "live" : "idle"} x={r.x} y={r.y} width={r.w} height={r.h} rx={18} vectorEffect="non-scaling-stroke" />
      })}
      {EDGES.map(e => {
        const touches = e.from === selected || e.to === selected
        const base = showAll ? "all" : e.core ? "core" : "hidden"
        return (
          <path key={`${e.from}-${e.to}`} className="feat-edge" data-kind={e.kind} data-edge={`${e.from}:${e.to}`}
            data-state={stateOf(e.kind, touches, base)}
            d={edgePath(NODE_BY_KEY[e.from], NODE_BY_KEY[e.to])} stroke={KIND_COLOR[e.kind]} fill="none" vectorEffect="non-scaling-stroke" />
        )
      })}
      {SCOPES.map(s => {
        const touches = s.from === selected || selGroup === s.group
        return (
          <path key={`${s.from}-@${s.group}`} className="feat-edge" data-kind="scope" data-edge={`${s.from}:@${s.group}`}
            data-state={stateOf("scope", touches, showAll ? "all" : "hidden")}
            d={scopePath(NODE_BY_KEY[s.from], s.group)} stroke={SCOPE_COLOR} fill="none" vectorEffect="non-scaling-stroke" />
        )
      })}
    </svg>
  )
}
