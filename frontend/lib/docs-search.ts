// Поиск по документации: без учета регистра и «ё/е», слова сравниваются по грубой основе,
// чтобы «прогнозов» находило «прогноз», а «зрелость» находило «зрелости». Все слова запроса обязательны.
export interface DocsEntry { id: string; kind: "section" | "faq"; title: string; body: string }

export const normalize = (s: string) => s.toLowerCase().replaceAll("\u0451", "\u0435")   // ё и е считаются одной буквой
const stem = (t: string) => (t.length > 5 ? t.slice(0, -2) : t)

export function searchDocs(entries: readonly DocsEntry[], query: string, limit = 8): DocsEntry[] {
  const tokens = normalize(query).split(/\s+/).filter(t => t.length >= 2).map(stem)
  if (!tokens.length) return []
  const scored: { e: DocsEntry; score: number; i: number }[] = []
  entries.forEach((e, i) => {
    const title = normalize(e.title)
    const body = normalize(e.body)
    let score = 0
    for (const t of tokens) {
      if (title.includes(t)) score += 3
      else if (body.includes(t)) score += 1
      else return
    }
    scored.push({ e, score, i })
  })
  return scored.sort((a, b) => b.score - a.score || a.i - b.i).slice(0, limit).map(x => x.e)
}
