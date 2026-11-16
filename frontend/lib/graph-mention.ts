import type { CSSProperties } from "react"
import type { ForceGraphEdge } from "@/components/graph/force-graph"
import { edgeColorFor } from "@/lib/graph-visuals"

// Упоминание: ссылка внутри текста записи, а не связь. На графе серый пунктир,
// чтобы не путать с подтверждает/опровергает/связано. Модуль отдельный: тесты мокают graph-visuals целиком.

export const MENTION_EDGE_COLOR = "#7a7f99"
export const MENTION_EDGE_DASH = "2,4"
export const MENTION_LEGEND_KEY = "graphVisuals.mentionLabel"
export const MENTION_DESCRIPTION_KEY = "graphVisuals.mentionDescription"

/** Пунктир ребра. Заменяет умолчание графа, поэтому «опровергает» повторён здесь. */
export function mentionAwareDash(e: ForceGraphEdge): string | null {
  if (e.mention) return MENTION_EDGE_DASH
  return e.linkType === "опровергает" ? "4,3" : null
}

export function mentionAwareColor(e: ForceGraphEdge): string {
  return e.mention ? MENTION_EDGE_COLOR : edgeColorFor(e.linkType)
}

/** Образец цвета в легенде: упоминание штрихом, остальное сплошной линией. */
export function legendSwatchStyle(color: string, labelKey: string, width: number): CSSProperties {
  return labelKey === MENTION_LEGEND_KEY
    ? { width, height: 0, borderTop: `2px dashed ${color}` }
    : { width, height: 2, background: color, borderRadius: 1 }
}
