import { VisibilityValue } from "@/components/ui/orbit-selector"

/**
 * Проверяет, проходит ли сущность через фильтр видимости (OrbitSelector).
 * "Публичное"/"Личное" — по полю visibility.
 * "Лаборатория" — по факту наличия lab_id, НЕЗАВИСИМО от visibility:
 * цель лабы может одновременно быть публичной (visibility='public')
 * и видимой лабе (lab_id != null) — это две независимые оси, не одна.
 */
export function matchesVisibilityFilter(item: { visibility: string; lab_id?: number | null }, active: VisibilityValue[]): boolean {
  if (active.length === 0) return true
  return active.some(v => v === "lab" ? item.lab_id != null : item.visibility === v)
}
