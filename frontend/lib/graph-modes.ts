// Режимы графа: «а что, если» (какие гипотезы держатся на сомнительных наблюдениях) и «слепые зоны».
// Чистая логика цвета и счётчиков; запросы и разметка живут в components/graph/use-graph-insights.tsx.

export type GraphMode = "normal" | "whatif" | "blind"
export type Verdict = "held" | "weakened" | "collapsed" | "strengthened" | "unknown"

export interface WhatIfHyp {
  node_id: string; eid: number; name: string
  level_before: number | null; level_after: number | null; verdict: Verdict
  load_bearing: string[]; observation_count: number
  signal_before?: number | null; signal_after?: number | null; signal_delta?: number | null
  full?: boolean; affected: boolean
}
export interface BlindSpot { rule: string; type: string; node_id: string; eid: number; label: string }

export const BLIND_RULES = ["no_falsification", "only_confirmations", "no_predictions", "prediction_overdue", "observation_orphan"] as const
export const RULE_KEYS: Record<string, string> = {
  no_falsification: "graphMode.rule.no_falsification",
  only_confirmations: "graphMode.rule.only_confirmations",
  no_predictions: "graphMode.rule.no_predictions",
  prediction_overdue: "graphMode.rule.prediction_overdue",
  observation_orphan: "graphMode.rule.observation_orphan",
}

export const COLORS = {
  collapsed: "#E74C3C", weakened: "#E67E22", strengthened: "#1ABC9C",
  excluded: "#5A5F78", loadBearing: "#F1C40F", blind: "#F39C12", dim: "#3A3F55", affected: "#ECECEC",
} as const

interface N { id: string; type: string; entityId: number }

/** Цвет узла в режиме «а что, если». Устоявшиеся гипотезы остаются своего цвета (fallback). */
export function whatIfColor(
  node: N,
  ctx: { excluded: ReadonlySet<number>; verdicts: ReadonlyMap<string, string>; loadBearing: ReadonlySet<string>; affected?: ReadonlySet<string> },
  fallback: string,
): string {
  if (node.type === "observation" && ctx.excluded.has(node.entityId)) return COLORS.excluded
  const v = ctx.verdicts.get(node.id)
  if (v === "collapsed" || v === "weakened" || v === "strengthened") return COLORS[v]
  if (ctx.affected?.has(node.id)) return COLORS.affected
  if (ctx.loadBearing.has(node.id)) return COLORS.loadBearing
  return fallback
}

/** Цвет узла в режиме «слепые зоны»: подсвечены узлы с выбранным правилом (или с любым), остальные приглушены. */
export function blindColor(node: { id: string }, spots: ReadonlyMap<string, ReadonlySet<string>>, rule: string | null): string {
  const has = spots.get(node.id)
  return has && (!rule || has.has(rule)) ? COLORS.blind : COLORS.dim
}

export function indexBlindSpots(items: BlindSpot[]): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>()
  for (const it of items) {
    if (!m.has(it.node_id)) m.set(it.node_id, new Set())
    m.get(it.node_id)!.add(it.rule)
  }
  return m
}

export function countByRule(items: BlindSpot[]): Record<string, number> {
  const c: Record<string, number> = {}
  for (const it of items) c[it.rule] = (c[it.rule] ?? 0) + 1
  return c
}

export function summarizeWhatIf(hyps: WhatIfHyp[]) {
  const s = { collapsed: 0, weakened: 0, held: 0, strengthened: 0, unknown: 0, loadBearing: 0, affected: 0 }
  const lb = new Set<string>()
  for (const h of hyps) {
    s[h.verdict] += 1
    if (h.affected) s.affected += 1
    h.load_bearing.forEach(id => lb.add(id))
  }
  s.loadBearing = lb.size
  return s
}

export function toggleId(list: number[], id: number): number[] {
  return list.includes(id) ? list.filter(x => x !== id) : [...list, id]
}

/** Выделять ли узел в режиме «а что, если»: исключённое, изменившееся, затронутое или несущее. */
export function whatIfOn(
  node: N,
  ctx: { excluded: ReadonlySet<number>; verdicts: ReadonlyMap<string, string>; loadBearing: ReadonlySet<string>; affected?: ReadonlySet<string> },
): boolean {
  if (node.type === "observation" && ctx.excluded.has(node.entityId)) return true
  const v = ctx.verdicts.get(node.id)
  if (v && v !== "held") return true
  return !!ctx.affected?.has(node.id) || ctx.loadBearing.has(node.id)
}

/** Выделять ли узел в режиме «слепые зоны»: есть выбранное правило (или любое, если не выбрано). */
export function blindOn(node: { id: string }, spots: ReadonlyMap<string, ReadonlySet<string>>, rule: string | null): boolean {
  const has = spots.get(node.id)
  return !!has && (!rule || has.has(rule))
}
