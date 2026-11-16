"use client"
// Стадия пути сущности (backend: api/v1/entity_stage.py). Один запрос и одно сохранение
// на всех, кто показывает стадию: StageBadge (лаборатория) и StageTrack (паспорт сущности).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api"

export function useEntityStage(entityType: string, entityId: number) {
  const qc = useQueryClient()
  const queryKey = ["entity-stage", entityType, entityId]
  const q = useQuery({
    queryKey,
    queryFn: () => api.get(`/api/v1/${entityType}/${entityId}/stage`).then(r => r.data as { current_stage: string } | null),
  })
  const m = useMutation({
    mutationFn: (stage: string) => api.put(`/api/v1/${entityType}/${entityId}/stage`, { stage }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  })
  return {
    /** null — стадия не отслеживается (валидное состояние, не ошибка) */
    stage: q.data?.current_stage ?? null,
    isLoading: q.isLoading,
    isPending: m.isPending,
    isError: m.isError,
    setStage: (stage: string, opts?: { onSuccess?: () => void }) => m.mutate(stage, opts),
  }
}
