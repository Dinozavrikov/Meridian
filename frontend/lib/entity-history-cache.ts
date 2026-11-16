import type { QueryClient } from "@tanstack/react-query"
import type { EntityType } from "@/lib/entity-routes"

/** Первый элемент queryKey списка каждого типа. Открытая карточка берётся из этого списка
 *  (useEntityUrlSync подтягивает свежую запись, когда список обновился), поэтому без его
 *  инвалидации после отката карточка осталась бы со старыми значениями. */
export const ENTITY_LIST_QUERY_KEYS: Record<EntityType, string> = {
  observation: "observations",
  hypothesis: "hypotheses",
  prediction: "predictions",
  worldview: "worldview",
  question: "questions",
  task: "tasks",
}

export const historyQueryKey = (type: EntityType, id: number) => ["entity-history", type, id] as const
export const linkHistoryQueryKey = (type: EntityType, id: number) => ["entity-link-history", type, id] as const

/** Значения шкал записи: тот же ключ, что у useScaleValues (lib/use-scales.ts). Без него после
 *  отката значения пользовательской шкалы слайдер остался бы со старым числом. */
export const scaleValuesQueryKey = (type: EntityType, id: number) => ["scale-values", type, id] as const

/** История этой записи, значения её шкал, список её типа (префикс покрывает и
 *  ["predictions", "mine"]), связанные записи и дашборд. Неактивные запросы только помечаются
 *  устаревшими и перезагрузятся при следующем открытии страницы. */
export function invalidateAfterUndo(qc: QueryClient, type: EntityType, id: number) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: historyQueryKey(type, id) }),
    qc.invalidateQueries({ queryKey: ["entity-link-history"] }),
    qc.invalidateQueries({ queryKey: scaleValuesQueryKey(type, id) }),
    qc.invalidateQueries({ queryKey: [ENTITY_LIST_QUERY_KEYS[type]] }),
    qc.invalidateQueries({ queryKey: ["related"] }),
    qc.invalidateQueries({ queryKey: ["dashboard"] }),
  ])
}
