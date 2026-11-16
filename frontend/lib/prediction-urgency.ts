import { differenceInDays, isPast, isToday } from "date-fns"

export type Urgency = "overdue" | "soon" | "ok" | "done"

/** Единая логика срочности прогноза — используется на /predictions,
 *  в MarginNotes на дашборде и в PredictionQueue. Не дублировать. */
export function getUrgency(p: { status: string; expected_check_date?: string }): Urgency {
  if (p.status !== "не проверен") return "done"
  if (!p.expected_check_date) return "ok"
  const d = new Date(p.expected_check_date)
  if (isPast(d) && !isToday(d)) return "overdue"
  // Точная длительность в мс, не differenceInDays (тот округляет вниз до
  // целых суток — прогноз через 7д 20ч давал бы differenceInDays===7 и
  // проходил бы порог, хотя бэкендный urgent_preds (soon_cutoff = now +
  // timedelta(days=7), точное сравнение таймстампов) его бы уже отсёк.
  // Из-за этого расхождения счётчик на /predictions мог быть на 1 больше,
  // чем на дашборде — см. баг-репорт Алексея 18.08.
  if (d.getTime() - Date.now() <= 7 * 24 * 60 * 60 * 1000) return "soon"
  return "ok"
}

export const URGENCY_COLOR: Record<Urgency, string> = {
  overdue: "#E74C3C", soon: "#F5A623", ok: "#2a2a35", done: "#27AE60",
}
export const URGENCY_LABEL: Record<Urgency, string> = {
  overdue: "Просрочен", soon: "Скоро", ok: "", done: "Проверен",
}

export function daysLeft(p: { expected_check_date?: string }): number | null {
  return p.expected_check_date ? differenceInDays(new Date(p.expected_check_date), new Date()) : null
}
