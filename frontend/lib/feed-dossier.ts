import { typeColor } from "@/lib/theme"
import { relationKind, type FeedGroup, type FeedItem, type RelationKind } from "@/lib/feed-groups"

// Модель «досье» карточки ленты: всё считается по ВИДИМЫМ участникам группы (то, что показано строками ниже),
// а не по счётчикам гипотезы: те включают приватные связи владельца и расходились бы с перечнем.

export const REL_COLOR: Record<RelationKind, string> = {
  confirm: "#27AE60", refute: "#E74C3C", neutral: "#8892A6", other: "#8892A6",
}
const NEUTRAL_NODE = "#8892A6"
const CLOSED_PREDICTION = new Set(["подтвердился", "частично подтвердился", "не подтвердился"])
const DAY_MS = 86_400_000

export interface Balance { confirm: number; refute: number; related: number; total: number }

export function evidenceBalance(members: { relation: string }[]): Balance {
  let confirm = 0, refute = 0, related = 0
  for (const m of members) {
    const kind = relationKind(m.relation)
    if (kind === "confirm") confirm++
    else if (kind === "refute") refute++
    else related++
  }
  return { confirm, refute, related, total: members.length }
}

export interface NextCheck { item: FeedItem; date: Date; days: number; state: "future" | "today" | "overdue" }

const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()

/** Ближайшая проверка среди ещё не закрытых прогнозов карточки (просроченная раньше будущей). */
export function nextCheck(group: FeedGroup, now: Date = new Date()): NextCheck | null {
  let best: { item: FeedItem; date: Date } | null = null
  for (const it of [group.core, ...group.members.map(m => m.item)]) {
    if (it.type !== "prediction" || CLOSED_PREDICTION.has(it.status ?? "")) continue
    const raw = it.expected_check_date
    const ms = typeof raw === "string" ? Date.parse(raw) : NaN
    if (!Number.isFinite(ms)) continue
    if (!best || ms < best.date.getTime()) best = { item: it, date: new Date(ms) }
  }
  if (!best) return null
  const diff = Math.round((dayStart(best.date) - dayStart(now)) / DAY_MS)   // round: сутки в переход на летнее время не 24 часа
  return { item: best.item, date: best.date, days: Math.abs(diff), state: diff > 0 ? "future" : diff === 0 ? "today" : "overdue" }
}

export const GRAPH_SIZE = 132
export const GRAPH_MAX_SLOTS = 8
const CENTER = GRAPH_SIZE / 2
const RING = 46

export interface GraphNode { key: string; x: number; y: number; r: number; fill: string; hollow?: boolean }
export interface GraphEdge { key: string; x1: number; y1: number; x2: number; y2: number; stroke: string; dashed: boolean }
export interface GraphModel { core: GraphNode; nodes: GraphNode[]; edges: GraphEdge[]; hidden: number }

const r2 = (n: number) => Math.round(n * 100) / 100

/** Схема карточки: ядро в центре, участники по кругу от верхней точки по часовой. Участников больше восьми — семь и
 *  пунктирный узел «+N» (hidden). Цвет узла — тип записи, цвет ребра — тип связи. */
export function graphModel(group: FeedGroup): GraphModel {
  const members = group.members
  const overflow = members.length > GRAPH_MAX_SLOTS
  const shown = overflow ? members.slice(0, GRAPH_MAX_SLOTS - 1) : members
  const hidden = overflow ? members.length - shown.length : 0
  const slots = shown.length + (overflow ? 1 : 0)
  const at = (i: number) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(slots, 1)
    return { x: r2(CENTER + RING * Math.cos(a)), y: r2(CENTER + RING * Math.sin(a)) }
  }
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  shown.forEach((m, i) => {
    const p = at(i)
    const kind = relationKind(m.relation)
    const key = `${m.item.type}:${m.item.entity_id}`
    nodes.push({ key, ...p, r: 6.5, fill: typeColor[m.item.type] ?? NEUTRAL_NODE })
    edges.push({ key, x1: CENTER, y1: CENTER, x2: p.x, y2: p.y, stroke: REL_COLOR[kind], dashed: kind === "neutral" || kind === "other" })
  })
  if (overflow) {
    const p = at(shown.length)
    nodes.push({ key: "overflow", ...p, r: 9, fill: NEUTRAL_NODE, hollow: true })
    edges.push({ key: "overflow", x1: CENTER, y1: CENTER, x2: p.x, y2: p.y, stroke: NEUTRAL_NODE, dashed: true })
  }
  return { core: { key: "core", x: CENTER, y: CENTER, r: 11, fill: typeColor[group.core.type] ?? NEUTRAL_NODE }, nodes, edges, hidden }
}
