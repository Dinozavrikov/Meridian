import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { EntityType } from "@/lib/entity-routes"

export interface PendingContradiction {
  feedback_id: number
  source_entity_type: EntityType
  source_entity_id: number
  entity_type: EntityType
  entity_id: number
  existing_quote: string
  new_quote: string
  relation: string
  confidence: number
  created_at: string
}

/** Тот же паттерн, что useUnreadMessages/useUnread — поллинг раз в 30с,
 * обновление при возврате фокуса на вкладку. */
export function useContradictionsPending() {
  const { data = [] } = useQuery<PendingContradiction[]>({
    queryKey: ["contradictions-pending"],
    queryFn: () => api.get("/api/v1/contradictions/pending").then(r => r.data),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  })
  return { items: data, count: data.length }
}
