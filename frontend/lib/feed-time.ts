// Время на карточке ленты. Раньше показывалось только «14:03» — в ленте за несколько
// дней непонятно, когда это было. Сегодня — только время, иначе дата + время
// (с годом, если не текущий).
export function formatFeedTime(d: Date, now: Date = new Date(), locale = "ru-RU"): string {
  const time = d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })
  const sameYear = d.getFullYear() === now.getFullYear()
  if (sameYear && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()) return time
  const date = d.toLocaleDateString(locale, sameYear
    ? { day: "numeric", month: "short" }
    : { day: "numeric", month: "short", year: "numeric" })
  return `${date}, ${time}`
}
