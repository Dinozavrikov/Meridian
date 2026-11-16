// Данные карты функций (/features).
// Ничего не хранится дважды:
//  - типы записей берутся из ENTITY_ROUTES, цвета из TYPE_COLORS (их охраняет type-colors.test.ts);
//  - разделы с пунктом меню берут название и маршрут из lib/nav.ts;
//  - числа в полосе считаются по источникам: стадии, уровни видимости, словарь связей.
// Руками здесь остаются состав колонок, порядок и связи между узлами. Это редакторское решение,
// а не данные. features-map.test.ts следит, чтобы карта не отстала от меню и от набора типов записей.
import { NAV_GROUPS, TRASH_ITEM, type NavItem } from "@/lib/nav"
import { ENTITY_ROUTES, isEntityType } from "@/lib/entity-routes"
import { STAGE_VALUES } from "@/lib/stage-labels"
import { VISIBILITY_LEVELS } from "@/lib/visibility-levels"
import { allowedLinkTypes } from "@/lib/link-vocab"
import { ACCENT, TYPE_COLORS } from "@/lib/utils"
import { v2 } from "@/lib/theme"

/** Размер холста. Высота равна высоте контейнера карты в пикселях, ширина масштабируется. */
export const VIEW_W = 1200
export const VIEW_H = 680
const TOP = 110
const BOTTOM = 610
const RAIL_HALF = 92

/** Колонки слева направо и узлы в них сверху вниз (от сырого факта к синтезу). */
export const MEMBERS = {
  records:   ["observation", "question", "hypothesis", "prediction", "worldview", "task"],
  analysis:  ["graph", "scales", "contradictions", "calibration", "stages", "stats"],
  platform:  ["history", "trash", "export", "translation"],
  community: ["feed", "discussion", "labs", "snapshots", "messages"],
} as const

export type GroupKey = keyof typeof MEMBERS
export type NodeKey = typeof MEMBERS[GroupKey][number]
export const GROUP_KEYS = Object.keys(MEMBERS) as GroupKey[]
export const membersOf = (g: GroupKey): readonly NodeKey[] => MEMBERS[g]
export const groupLabelKey = (g: GroupKey) => `featuresPage.group.${g}`

const GROUP_ACCENT: Record<GroupKey, string> = {
  records: ACCENT, analysis: v2.teal, platform: v2.t3, community: "#8b80f0",
}
export const groupAccent = (g: GroupKey) => GROUP_ACCENT[g]

const columnX = (g: GroupKey) => ((GROUP_KEYS.indexOf(g) + 0.5) * VIEW_W) / GROUP_KEYS.length

/** Маршруты узлов, которые не являются типом записи. У узлов без маршрута своей страницы нет. */
const PAGE_HREF: Partial<Record<NodeKey, string>> = {
  graph: "/graph", scales: "/scales", stats: "/stats", trash: "/trash", contradictions: "/contradictions",
  export: "/settings/export", feed: "/feed", labs: "/labs", messages: "/messages",
}
const NAV_BY_HREF = new Map<string, NavItem>(
  [...NAV_GROUPS.flatMap(g => g.items), TRASH_ITEM].map(i => [i.href, i]),
)

export interface MapNode {
  key: NodeKey
  group: GroupKey
  nameKey: string
  textKey: string
  color: string
  href?: string
  x: number
  y: number
}

function hrefOf(key: NodeKey): string | undefined {
  return isEntityType(key) ? ENTITY_ROUTES[key] : PAGE_HREF[key]
}

function colorOf(key: NodeKey, group: GroupKey): string {
  if (isEntityType(key)) return TYPE_COLORS[key]
  return key === "labs" ? TYPE_COLORS.lab : GROUP_ACCENT[group]
}

export const NODES: readonly MapNode[] = GROUP_KEYS.flatMap(group => {
  const keys = membersOf(group)
  return keys.map((key, i): MapNode => {
    const href = hrefOf(key)
    return {
      key, group, href,
      nameKey: (href && NAV_BY_HREF.get(href)?.labelKey) || `featuresPage.node.${key}.name`,
      textKey: `featuresPage.node.${key}.text`,
      color: colorOf(key, group),
      x: columnX(group),
      y: keys.length > 1 ? TOP + (i * (BOTTOM - TOP)) / (keys.length - 1) : (TOP + BOTTOM) / 2,
    }
  })
})

export const NODE_BY_KEY = Object.fromEntries(NODES.map(n => [n.key, n])) as Record<NodeKey, MapNode>

export interface MapEdge { from: NodeKey; to: NodeKey; kind: EdgeKind; core: boolean }
/** Узел действует на записи любого типа: вместо шести линий рисуется одна к рамке колонки. */
export interface MapScope { from: NodeKey; group: GroupKey }

const e = (kind: EdgeKind, from: NodeKey, to: NodeKey, core = false): MapEdge => ({ from, to, kind, core })

export const EDGES: readonly MapEdge[] = [
  // Ключевая цепочка: от факта к проверке и к людям. Видна сразу.
  e("evidence", "observation", "hypothesis", true), e("evidence", "hypothesis", "prediction", true),
  e("growth", "hypothesis", "worldview", true), e("growth", "hypothesis", "task", true),
  e("analysis", "hypothesis", "graph", true),
  e("community", "feed", "hypothesis", true), e("community", "labs", "feed", true),
  // Откуда вырастают записи
  e("growth", "observation", "question"), e("growth", "observation", "task"), e("growth", "question", "task"),
  // Измерение
  e("analysis", "hypothesis", "stats"), e("analysis", "prediction", "stats"), e("analysis", "prediction", "calibration"),
  e("analysis", "history", "scales"), e("analysis", "trash", "calibration"),
  // Работа с людьми
  e("community", "calibration", "labs"), e("community", "stages", "labs"),
  e("community", "translation", "feed"), e("community", "translation", "discussion"), e("community", "discussion", "feed"),
  e("community", "labs", "observation"), e("community", "labs", "hypothesis"), e("community", "labs", "prediction"), e("community", "labs", "snapshots"),
]

export const SCOPES: readonly MapScope[] = (
  ["graph", "scales", "contradictions", "stages", "history", "trash", "export", "translation", "feed", "discussion"] as NodeKey[]
).map(from => ({ from, group: "records" as GroupKey }))

/** Узлы, с которыми работает выбранный: явные связи плюс сквозные действия на колонку. */
export function neighbors(key: NodeKey): NodeKey[] {
  const own = NODE_BY_KEY[key]
  const out = new Set<NodeKey>()
  for (const ed of EDGES) {
    if (ed.from === key) out.add(ed.to)
    else if (ed.to === key) out.add(ed.from)
  }
  for (const s of SCOPES) {
    if (s.from === key) membersOf(s.group).forEach(m => out.add(m))
    else if (own.group === s.group) out.add(s.from)
  }
  out.delete(key)
  return NODES.map(n => n.key).filter(k => out.has(k))
}

// Геометрия: чистые функции, чтобы тест мог проверить концы линий.
export interface Rail { x: number; y: number; w: number; h: number }

export function groupRail(group: GroupKey): Rail {
  return { x: columnX(group) - RAIL_HALF, y: 76, w: RAIL_HALF * 2, h: VIEW_H - 76 - 36 }
}

export function edgePath(from: MapNode, to: MapNode): string {
  if (from.x === to.x) {
    const bulge = from.x + 110
    return `M${from.x},${from.y} C${bulge},${from.y} ${bulge},${to.y} ${to.x},${to.y}`
  }
  const mx = (from.x + to.x) / 2
  return `M${from.x},${from.y} C${mx},${from.y} ${mx},${to.y} ${to.x},${to.y}`
}

export function scopeEnd(from: MapNode, group: GroupKey): { x: number; y: number } {
  const r = groupRail(group)
  return { x: from.x > r.x + r.w / 2 ? r.x + r.w : r.x, y: r.y + r.h / 2 }
}

export function scopePath(from: MapNode, group: GroupKey): string {
  const end = scopeEnd(from, group)
  const mx = (from.x + end.x) / 2
  return `M${from.x},${from.y} C${mx},${from.y} ${mx},${end.y} ${end.x},${end.y}`
}

// Числа для полосы под заголовком: считаются, а не вписываются.
/** Все виды связи, которые словарь разрешает хоть для одной пары типов записей. */
export function linkKinds(): string[] {
  const types = Object.keys(ENTITY_ROUTES)
  return [...new Set(types.flatMap(a => types.flatMap(b => allowedLinkTypes(a, b))))]
}

export function featureStats() {
  return {
    recordTypes: Object.keys(ENTITY_ROUTES).length,
    linkKinds: linkKinds().length,
    stages: STAGE_VALUES.length,
    visibilityLevels: VISIBILITY_LEVELS.length,
  }
}

/** Два сценария на странице. Шаги это узлы карты: названия и цвета берутся оттуда. */
export const TRACKS: readonly { key: "curiosity" | "research"; steps: readonly NodeKey[] }[] = [
  { key: "curiosity", steps: ["observation", "hypothesis", "prediction", "discussion", "calibration"] },
  { key: "research", steps: ["labs", "hypothesis", "stages", "snapshots", "feed"] },
]

/** Возможности помельче, которых нет на карте, по колонкам. Тексты: featuresPage.inv.<пункт>.name и .text. */
export const INVENTORY: Record<GroupKey, readonly string[]> = {
  records: ["falsification", "factInterpretation", "evidenceBalance", "evidenceDiversity", "maturity", "attachments", "tags"],
  analysis: ["ownScales", "tagCalibration", "closedPredictions", "practiceLevel", "recheck"],
  platform: ["search", "languages", "notifications", "account", "settings"],
  community: ["results", "labRoles", "leaderboard", "feedModes", "privateNotes", "profiles", "unread"],
}

// Виды связей: цвет линии означает смысл связи, а не то, откуда она идет. Легенда под картой строится из LEGEND.
export const EDGE_KINDS = ["evidence", "growth", "analysis", "community"] as const
export type EdgeKind = typeof EDGE_KINDS[number]
export type LegendKey = EdgeKind | "scope"
export const LEGEND: readonly LegendKey[] = [...EDGE_KINDS, "scope"]

export const KIND_COLOR: Record<EdgeKind, string> = {
  evidence: ACCENT, growth: v2.amber, analysis: v2.teal, community: "#8b80f0",
}
/** Сквозные связи нейтральные: они говорят не о смысле между двумя записями, а об области действия. */
export const SCOPE_COLOR = v2.t3
export const legendColor = (k: LegendKey): string => (k === "scope" ? SCOPE_COLOR : KIND_COLOR[k])
