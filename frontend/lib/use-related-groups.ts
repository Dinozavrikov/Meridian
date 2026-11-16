"use client"
// Связанные записи сущности, сгруппированные по типам. Один запрос на всех: вкладки, счётчики и блок
// «Что уже известно» читают его из общего кэша (тот же ключ, что инвалидируют правки связей).
import { useTranslatedRelated } from "@/lib/i18n/use-translated-query"
import { countsByType, type RelatedGroups } from "@/lib/related-summary"

export function useRelatedGroups(entityType: string, entityId: number) {
  const { data, isLoading } = useTranslatedRelated(entityType, entityId)
  const grouped: RelatedGroups = (data as { related?: RelatedGroups } | undefined)?.related ?? {}
  const total = Object.values(grouped).reduce((sum, items) => sum + items.length, 0)
  return { grouped, total, isLoading, counts: !isLoading && data ? countsByType(grouped) : ({} as Record<string, number>) }
}
