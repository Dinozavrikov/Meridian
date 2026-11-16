import { parseEntityDate, toIntlLocale } from "@/lib/theme"

export interface DayGroup<T> { key: string; date: Date | null; items: T[] }

const pad = (n: number) => String(n).padStart(2, "0")
export const localDayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** Подряд идущие элементы одного ЛОКАЛЬНОГО дня — в одну группу (список уже отсортирован по
 *  времени). Элементы с неразбираемой датой не теряются: своя группа "unknown". */
export function groupByDay<T>(rows: T[], rawDate: (row: T) => string): DayGroup<T>[] {
  const groups: DayGroup<T>[] = []
  for (const row of rows) {
    const date = parseEntityDate(rawDate(row))
    const key = date ? localDayKey(date) : "unknown"
    const last = groups[groups.length - 1]
    if (last && last.key === key) last.items.push(row)
    else groups.push({ key, date, items: [row] })
  }
  return groups
}

/** «Сегодня» / «Вчера» / «20 сентября» (с годом, если он не текущий). Пустая строка — дата неизвестна. */
export function dayHeaderLabel(date: Date | null, now: Date, locale: string, t: (key: string) => string): string {
  if (!date) return ""
  const key = localDayKey(date)
  if (key === localDayKey(now)) return t("history.today")
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (key === localDayKey(yesterday)) return t("history.yesterday")
  return date.toLocaleDateString(toIntlLocale(locale), {
    day: "numeric", month: "long", ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  })
}
