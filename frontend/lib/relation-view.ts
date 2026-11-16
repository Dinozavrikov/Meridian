export type RelSort = "default" | "fresh"
interface ViewItem { link_type?: string | null; source?: string; stance?: string | null; linked_at?: string | null }

/** Тип связи для фильтра: у связи из поля прогноза он лежит в stance, у остальных в link_type. */
export const linkKey = (i: ViewItem) => (i.source === "field" ? i.stance : i.link_type)

/**
 * Фильтр по типу связи и сортировка по свежести. Конкурирующие гипотезы типа «подтверждает/опровергает» не имеют,
 * поэтому при активном фильтре скрываются; при сортировке «сначала новые» остаются первыми (у них нет даты связи).
 */
export function viewItems<T extends ViewItem>(items: T[], o: { filter: string; sort: RelSort }): T[] {
  const keep = (i: T) => o.filter === "all" || (i.source !== "competing" && linkKey(i) === o.filter)
  const shown = items.filter(keep)
  if (o.sort === "default") return shown
  const ts = (i: T) => (i.linked_at ? Date.parse(i.linked_at) : 0)
  const competing = shown.filter(i => i.source === "competing")
  const rest = shown.filter(i => i.source !== "competing").sort((a, b) => ts(b) - ts(a))
  return [...competing, ...rest]
}
