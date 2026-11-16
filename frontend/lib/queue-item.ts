import type { QueueItem } from "@/components/entities/prediction-queue"

/** Единый вид записи прогноза для очереди проверки и окна закрытия. Принимает и запись списка прогнозов
 *  (expected_check_date), и запись дашборда (check_date). Поле, которого нет в ответе, остаётся undefined:
 *  это не «уверенность не указана» (её признак null), и подсказки окна закрытия на нём не срабатывают. */
export function toQueueItem(p: any): QueueItem {
  return {
    id: p.id, title: p.title, text: p.text, status: p.status ?? "не проверен",
    expected_check_date: p.expected_check_date ?? p.check_date,
    hyp_name: p.hyp_name, hypothesis_id: p.hypothesis_id, is_onboarding: p.is_onboarding,
    confidence: p.confidence, confirms_hypothesis_if_true: p.confirms_hypothesis_if_true,
  }
}
