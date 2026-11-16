import { theme } from "@/lib/theme"
import { WORLDVIEW_INFLUENCE } from "@/lib/worldview-influence"

// Единый визуальный язык графов проекта.
// Формы узлов и цвета связей описаны один раз здесь и используются
// как canvas-рендером (LocalGraphPanel), так и SVG/d3-рендером
// (GlobalGraph, TaskGraphTab), чтобы гипотеза/наблюдение/убеждение и т.д.
// выглядели одинаково во всех графах приложения.

export type NodeShape = "hexagon" | "diamond" | "ring" | "triangle" | "square" | "circle"

export const NODE_SHAPES: Record<string, NodeShape> = {
  hypothesis:  "hexagon",
  observation: "diamond",
  worldview:   "ring",
  prediction:  "triangle",
  task:        "square",
  question:    "circle",
  lab:         "circle",
  source:      "diamond",
}

export function shapeFor(entityType: string): NodeShape {
  return NODE_SHAPES[entityType] ?? "circle"
}

/** Точки правильного многоугольника с вершиной, направленной вверх (для hexagon/diamond/triangle/square). */
function polygonPoints(cx: number, cy: number, r: number, sides: number, rotationDeg = -90): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = []
  const rot = (rotationDeg * Math.PI) / 180
  for (let i = 0; i < sides; i++) {
    const a = rot + (i / sides) * Math.PI * 2
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r })
  }
  return pts
}

/** Возвращает точки полигона для формы, либо null если форма рисуется дугой (circle/ring). */
export function shapePoints(shape: NodeShape, cx: number, cy: number, r: number): { x: number; y: number }[] | null {
  switch (shape) {
    case "hexagon":  return polygonPoints(cx, cy, r, 6, -90)
    case "diamond":  return polygonPoints(cx, cy, r * 1.15, 4, -90)
    case "triangle": return polygonPoints(cx, cy, r * 1.2, 3, -90)
    case "square": {
      const s = r * 0.82
      return [
        { x: cx - s, y: cy - s }, { x: cx + s, y: cy - s },
        { x: cx + s, y: cy + s }, { x: cx - s, y: cy + s },
      ]
    }
    case "ring":
    case "circle":
    default:
      return null
  }
}

/** Рисует контур узла (fill+stroke) на 2D-канвасе согласно его форме. */
export function drawNodeShape(
  ctx: CanvasRenderingContext2D,
  shape: NodeShape,
  cx: number, cy: number, r: number,
  fillStyle: string, strokeStyle: string, lineWidth: number,
) {
  if (shape === "ring") {
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fillStyle = fillStyle
    ctx.fill()
    ctx.strokeStyle = strokeStyle
    ctx.lineWidth = lineWidth
    ctx.stroke()
    // внутреннее кольцо — визуальный маркер "якоря" (worldview)
    ctx.beginPath()
    ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2)
    ctx.strokeStyle = strokeStyle
    ctx.lineWidth = Math.max(1, lineWidth * 0.7)
    ctx.globalAlpha = 0.7
    ctx.stroke()
    ctx.globalAlpha = 1
    return
  }

  const pts = shapePoints(shape, cx, cy, r)
  ctx.beginPath()
  if (!pts) {
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
  } else {
    ctx.moveTo(pts[0].x, pts[0].y)
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
    ctx.closePath()
  }
  ctx.fillStyle = fillStyle
  ctx.fill()
  ctx.strokeStyle = strokeStyle
  ctx.lineWidth = lineWidth
  ctx.stroke()
}

/** Строит SVG path ("d" атрибут) для формы — для будущего переиспользования в d3/SVG-графах. */
export function shapeToSvgPath(shape: NodeShape, cx: number, cy: number, r: number): string | null {
  const pts = shapePoints(shape, cx, cy, r)
  if (!pts) return null
  return "M " + pts.map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" L ") + " Z"
}

// ── Связи ────────────────────────────────────────────────────────────────

export type InfluenceKind = "strengthens" | "challenges" | "transforms" | "contradicts"
export type EdgeKind = "confirms" | "refutes" | "neutral" | "prediction_of" | "competing_hypothesis" | InfluenceKind

// Влияние на убеждение: цвет, подпись и описание из WORLDVIEW_INFLUENCE (единый источник), здесь своих копий нет.
const influence = (v: InfluenceKind) => WORLDVIEW_INFLUENCE.find(i => i.value === v)!

export function edgeKind(linkType: string | undefined): EdgeKind {
  if (linkType === "подтверждает" || linkType === "confirms") return "confirms"
  if (linkType === "опровергает" || linkType === "refutes") return "refutes"
  if (linkType === "prediction_of") return "prediction_of"
  if (linkType === "competing_hypothesis") return "competing_hypothesis"
  if (WORLDVIEW_INFLUENCE.some(i => i.value === linkType)) return linkType as InfluenceKind
  return "neutral"
}

export const EDGE_COLOR: Record<EdgeKind, string> = {
  confirms: "#2ECC71",
  refutes:  "#E74C3C",
  neutral:  theme.edgeNeutral,
  prediction_of: "#F5A623",
  competing_hypothesis: "#9B59B6",
  strengthens: influence("strengthens").color,
  challenges: influence("challenges").color,
  transforms: influence("transforms").color,
  contradicts: influence("contradicts").color,
}

export function edgeColorFor(linkType: string | undefined): string {
  return EDGE_COLOR[edgeKind(linkType)]
}

/** Ключи i18n подписи для легенды графа — сам текст резолвится вызывающим
 * .tsx-компонентом через t(), т.к. этот файл — чистый .ts без хуков. */
export const EDGE_LABEL_KEY: Record<EdgeKind, string> = {
  confirms: "linkType.confirms",
  refutes:  "linkType.refutes",
  neutral:  "linkType.related",
  prediction_of: "graphVisuals.predictionOfLabel",
  competing_hypothesis: "graphVisuals.competingHypothesisLabel",
  strengthens: influence("strengthens").labelKey,
  challenges: influence("challenges").labelKey,
  transforms: influence("transforms").labelKey,
  contradicts: influence("contradicts").labelKey,
}

/** Ключи i18n развёрнутого описания для тултипа при наведении на линию связи. */
export const EDGE_DESCRIPTION_KEY: Record<EdgeKind, string> = {
  confirms: "graphVisuals.confirmsDescription",
  refutes:  "graphVisuals.refutesDescription",
  neutral:  "graphVisuals.neutralDescription",
  prediction_of: "graphVisuals.predictionOfDescription",
  competing_hypothesis: "graphVisuals.competingHypothesisDescription",
  strengthens: influence("strengthens").descKey,
  challenges: influence("challenges").descKey,
  transforms: influence("transforms").descKey,
  contradicts: influence("contradicts").descKey,
}

export function edgeLabelKeyFor(linkType: string | undefined): string {
  return EDGE_LABEL_KEY[edgeKind(linkType)]
}

export function edgeDescriptionKeyFor(linkType: string | undefined): string {
  return EDGE_DESCRIPTION_KEY[edgeKind(linkType)]
}

/** Стандартный набор [цвет, i18n-ключ подписи] для статичной легенды под графом. */
export const EDGE_LEGEND: [string, string][] = [
  [EDGE_COLOR.confirms, EDGE_LABEL_KEY.confirms],
  [EDGE_COLOR.refutes,  EDGE_LABEL_KEY.refutes],
  [EDGE_COLOR.neutral,  EDGE_LABEL_KEY.neutral],
  [EDGE_COLOR.prediction_of, EDGE_LABEL_KEY.prediction_of],
  [EDGE_COLOR.competing_hypothesis, EDGE_LABEL_KEY.competing_hypothesis],
]

// ── Орбитальная раскладка ────────────────────────────────────────────────
// Подтверждающие связи — сектор сверху (ближе к центру),
// опровергающие — сектор снизу, нейтральные — по бокам (дальше от центра).
// Это даёт мгновенно читаемый визуальный баланс доказательств.

export interface OrbitItem<T> {
  item: T
  linkType?: string
}

export interface OrbitPlacement<T> {
  item: T
  x: number
  y: number
  ring: number // 0 = ближе к центру, 1 = дальше
}

const SECTOR = {
  confirms: { from: -145, to: -35 },   // верхний сектор
  refutes:  { from: 35,   to: 145 },   // нижний сектор
  neutral:  { from: 145,  to: 215 },   // боковой сектор (обёрнут через 180°, обрабатывается отдельно ниже)
}

export function orbitalLayout<T>(
  items: OrbitItem<T>[],
  cx: number, cy: number, baseRadius: number,
): OrbitPlacement<T>[] {
  const groups: Record<"confirms" | "refutes" | "neutral", OrbitItem<T>[]> = { confirms: [], refutes: [], neutral: [] }
  items.forEach(it => {
    const kind = edgeKind(it.linkType)
    // раскладка знает только confirms/refutes/neutral-сектора — остальные типы
    // связи визуально размещаются как neutral (боковой сектор)
    const bucket = kind === "confirms" || kind === "refutes" ? kind : "neutral"
    groups[bucket].push(it)
  })

  const placements: OrbitPlacement<T>[] = []

  const placeGroup = (group: OrbitItem<T>[], fromDeg: number, toDeg: number, ring: number) => {
    const n = group.length
    if (n === 0) return
    const spanDeg = toDeg - fromDeg
    const radius = baseRadius * (ring === 0 ? 0.82 : 1.08)
    group.forEach((it, i) => {
      // равномерно внутри сектора, с отступом от краёв
      const t = n === 1 ? 0.5 : i / (n - 1)
      const deg = fromDeg + spanDeg * 0.12 + spanDeg * 0.76 * t
      const rad = (deg * Math.PI) / 180
      placements.push({
        item: it.item,
        x: cx + Math.cos(rad) * radius,
        y: cy + Math.sin(rad) * radius,
        ring,
      })
    })
  }

  // подтверждающие — ближе (ring 0), верхний сектор
  placeGroup(groups.confirms, SECTOR.confirms.from, SECTOR.confirms.to, 0)
  // опровергающие — тоже видимы, нижний сектор, чуть дальше для контраста
  placeGroup(groups.refutes, SECTOR.refutes.from, SECTOR.refutes.to, 1)
  // нейтральные — по бокам (левый + правый полусектор), дальше всех
  const half = Math.ceil(groups.neutral.length / 2)
  placeGroup(groups.neutral.slice(0, half), -35, 35, 1)      // правая сторона
  placeGroup(groups.neutral.slice(half), 145, 215, 1)         // левая сторона

  return placements
}
