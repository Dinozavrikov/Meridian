import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { messagesApi } from "@/lib/api"

export interface UnreadItem {
  entity_type: string
  entity_id: number
  entity_slug: string
  entity_title: string
  count: number
  last_content: string
  last_author: string
  last_at: string
}

export function useUnread() {
  const { data: items = [] } = useQuery<UnreadItem[]>({
    queryKey: ["unread"],
    queryFn: () => api.get("/api/v1/comments/unread/summary").then(r => r.data),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  })

  const total = items.reduce((a, i) => a + i.count, 0)
  const byType = (type: string) => items.filter(i => i.entity_type === type)
  const forFeed = items.filter(i => i.entity_type !== "lab")
  const forLabs = items.filter(i => i.entity_type === "lab")

  return { items, total, byType, forFeed, forLabs }
}

export function useMarkSeen() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ entityType, entityId }: { entityType: string; entityId: number }) =>
      api.post(`/api/v1/comments/seen/${entityType}/${entityId}`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["unread"] }),
  })
}

// Отдельный источник — счётчик непрочитанных личных сообщений.
// Форма ответа API заранее не гарантирована, поэтому берём число защищённо.
export function useUnreadMessages() {
  const { data } = useQuery({
    queryKey: ["unread-messages"],
    queryFn: () => messagesApi.unreadCount(),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  })
  const count = typeof data === "number" ? data : (data?.count ?? data?.unread_count ?? 0)
  return { count }
}
