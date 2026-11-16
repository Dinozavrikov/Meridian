// Подписи узлов графа: что писать (nodeLabel) и какие из них показать, не наложив друг на друга.
// Подписи имеют фиксированный размер на экране, поэтому зум расцепляет их: узлы расходятся, текст нет.

export function nodeLabel(node: { label?: string | null; isCenter?: boolean }): string {
  const label = node.label ?? ""
  const limit = node.isCenter ? 28 : 24
  return label.length > limit ? label.slice(0, limit) + "\u2026" : label
}

/** Приоритет подписи: центр, затем гипотезы (хабы графа), затем остальные по числу связей. */
export function labelPriority(node: { type: string; isCenter?: boolean }, degree: number): number {
  if (node.isCenter) return 1_000_000
  return (node.type === "hypothesis" ? 10_000 : 0) + degree
}

/** Рамка подписи в экранных координатах; x, y — центр. */
export interface LabelBox { id: string; x: number; y: number; w: number; h: number; priority: number }

/** Жадно: подписи по убыванию приоритета, показывается только та, что не пересекает уже принятые. */
export function pickVisibleLabels(boxes: LabelBox[], pad = 2): Set<string> {
  const sorted = [...boxes].sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))
  const accepted: LabelBox[] = []
  for (const b of sorted) {
    const clash = accepted.some(a =>
      Math.abs(a.x - b.x) < (a.w + b.w) / 2 + pad && Math.abs(a.y - b.y) < (a.h + b.h) / 2 + pad)
    if (!clash) accepted.push(b)
  }
  return new Set(accepted.map(b => b.id))
}

/** Во сколько раз подпись крупнее базового размера при зуме k: растёт медленнее узлов, потолок 2x. */
export function labelScale(k: number): number {
  return Math.min(2, Math.max(1, Math.pow(k, 0.4)))
}
