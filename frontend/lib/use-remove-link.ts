import { useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { useT } from "@/lib/i18n/useT"
import { announceLinkChange } from "@/lib/link-undo"

/** Удаление своей связи записи с «Вернуть» в общем хосте уведомлений. Один хук вместо копий во вкладках.
 *  Откат платформенный (событие удаления связи из истории). Событие не нашлось: только сообщение. */
export function useRemoveLinkWithUndo(entityType: string, entityId: number) {
  const t = useT()
  const qc = useQueryClient()
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["related", entityType, entityId] })
    qc.invalidateQueries({ queryKey: ["entity-link-history"] })
  }
  return useMutation({
    mutationFn: async ({ toType, toId }: { toType: string; toId: number }) => {
      await api.delete(`/api/v1/graph/links?from_type=${entityType}&from_id=${entityId}&to_type=${toType}&to_id=${toId}`)
      return { toType, toId }
    },
    onSuccess: r => {
      refresh()
      void announceLinkChange({ entityType, entityId, kind: "remove", other: { type: r.toType, id: r.toId }, message: t("relations.removed"), tone: "info", onUndone: refresh })
    },
  })
}
