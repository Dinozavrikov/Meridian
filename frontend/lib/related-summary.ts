// Сводка связанных записей по типам: для блока «Что уже известно» и счётчиков на вкладках.
export interface RelatedItem { link_type?: string | null }
export type RelatedGroups = Record<string, RelatedItem[]>

export const CONFIRMS = "подтверждает"
export const REFUTES = "опровергает"
/** Порядок типов в сводке: сначала то, на чём строятся выводы. */
export const RELATED_TYPE_ORDER = ["hypothesis", "observation", "prediction", "worldview", "question", "task"] as const

export interface TypeSummary { type: string; count: number; confirming: number; refuting: number; neutral: number }

export function summarizeRelated(grouped: RelatedGroups): TypeSummary[] {
  const order = RELATED_TYPE_ORDER as readonly string[]
  const types = [
    ...order.filter(t => (grouped[t]?.length ?? 0) > 0),
    ...Object.keys(grouped).filter(t => !order.includes(t) && grouped[t].length > 0),
  ]
  return types.map(type => {
    const items = grouped[type]
    const confirming = items.filter(i => i.link_type === CONFIRMS).length
    const refuting = items.filter(i => i.link_type === REFUTES).length
    return { type, count: items.length, confirming, refuting, neutral: items.length - confirming - refuting }
  })
}

/** Все известные типы присутствуют (отсутствующие — нули): пустая вкладка приглушается, а не остаётся без числа. */
export function countsByType(grouped: RelatedGroups): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const t of RELATED_TYPE_ORDER) counts[t] = 0
  for (const [type, items] of Object.entries(grouped)) counts[type] = items.length
  return counts
}
