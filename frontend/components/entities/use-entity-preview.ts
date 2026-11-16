"use client"
import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/api"
import type { LinkEffect } from "@/lib/link-effect"
import type { HypothesisEffect } from "@/components/entities/effects-block"

export interface Preview {
  type: string; id: number; title: string; excerpt: string; status: string | null; visibility: string | null
  created_at: string | null; author: { username: string; display_name: string }
  is_owner: boolean; tags: string[]; metrics: { key: string; value: number | string }[]; links_count: number
  effect?: LinkEffect | null  // вклад прогноза в сигнал его гипотезы; приходит только владельцу гипотезы
  effects?: HypothesisEffect[]  // у наблюдения: вклад в каждую гипотезу зрителя
}

/** Предпросмотр записи: доступ проверяет сервер (недоступное = 404, retry не нужен). */
export function useEntityPreview(type: string, id: number, enabled: boolean) {
  return useQuery({
    queryKey: ["entity-preview", type, id],
    queryFn: () => api.get(`/api/v1/${type}/${id}/preview`).then(r => r.data as Preview),
    enabled, staleTime: 60_000, retry: false,
  })
}
