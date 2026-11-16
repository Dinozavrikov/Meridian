import { useQuery, useQueryClient } from "@tanstack/react-query"
import { questionAnswerApi } from "@/lib/question-answer-api"

// Аналог useUnread — счётчик pending-находок (явных и фоновых) для бейджа
// в навигации возле "Вопросы". Тот же паттерн polling, что и остальные
// счётчики в проекте (unread comments/messages).
export function useQuestionAnswerPending() {
  const { data: items = [] } = useQuery({
    queryKey: ["question-answer-pending-all"],
    queryFn: () => questionAnswerApi.listPending(),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  })
  return { items, total: items.length }
}
