"use client"
import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import type { EntityType } from "@/lib/entity-routes"
import { historyQueryKey, linkHistoryQueryKey } from "@/lib/entity-history-cache"

/** Ключ мутации отката: она сама перечитывает историю (invalidateAfterUndo), второй раз не нужно. */
export const UNDO_MUTATION_KEY = ["entity-undo"] as const

/** Пока вкладка истории открыта, любая УСПЕШНАЯ мутация в приложении (слайдер шкалы, форма
 *  правки, смена статуса...) перечитывает историю записи. Подписка на кэш мутаций, а не вызов в
 *  каждой мутации каждой страницы: новая правка без единой строки в странице уже попадёт в
 *  историю. Лишний запрос при несвязанной мутации дешёвый, нужный не пропустится. */
export function useHistoryLiveRefresh(type: EntityType, id: number) {
  const qc = useQueryClient()
  useEffect(() => {
    return qc.getMutationCache().subscribe(event => {
      if (event.type !== "updated" || event.action.type !== "success") return
      if (event.mutation.options.mutationKey?.[0] === UNDO_MUTATION_KEY[0]) return
      void qc.invalidateQueries({ queryKey: historyQueryKey(type, id) })
      void qc.invalidateQueries({ queryKey: linkHistoryQueryKey(type, id) })
    })
  }, [qc, type, id])
}
