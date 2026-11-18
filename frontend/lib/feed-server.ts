import { FEED_PAGE_SIZE, type FeedGroupsPage } from "@/lib/feed-groups"

export const FEED_REVALIDATE_SECONDS = 120

/** Первая страница публичной ленты для серверной отрисовки. Backend зовется по внутреннему адресу
 *  INTERNAL_API_URL (например http://backend:8000). Нет переменной или любая ошибка: null, и лента грузится в браузере. */
export async function fetchPublicFeedFirstPage(): Promise<FeedGroupsPage | null> {
  const base = process.env.INTERNAL_API_URL?.trim().replace(/\/+$/, "")
  if (!base) return null
  try {
    const res = await fetch(`${base}/api/v1/feed/groups/public?page=1&page_size=${FEED_PAGE_SIZE}`, {
      signal: AbortSignal.timeout(4000),
      next: { revalidate: FEED_REVALIDATE_SECONDS },
    })
    if (!res.ok) return null
    const data = await res.json()
    return data && Array.isArray(data.groups) ? (data as FeedGroupsPage) : null
  } catch {
    return null
  }
}

const TYPE_RE = /^[a-z_]{1,32}$/
export interface SitemapRecord { type: string; id: number; updated_at: string }
const ID_RE = /^\d{1,9}$/

/** Ядро карточки записи для метатегов. Параметры из URL проверяются до подстановки в адрес backend.
 *  Без INTERNAL_API_URL, при ошибке или для недоступной гостю записи (приватная, лабораторная, удаленная): null. */
export async function fetchEntityCore(type: string, id: string): Promise<Record<string, any> | null> {
  const base = process.env.INTERNAL_API_URL?.trim().replace(/\/+$/, "")
  if (!base || !TYPE_RE.test(type) || !ID_RE.test(id)) return null
  try {
    const res = await fetch(`${base}/api/v1/feed/groups/entity/${type}/${id}`, {
      signal: AbortSignal.timeout(4000),
      next: { revalidate: 300 },
    })
    if (!res.ok) return null
    const data = await res.json()
    return data && typeof data.core === "object" && data.core ? data.core : null
  } catch {
    return null
  }
}

/** Публичные записи для sitemap. Без INTERNAL_API_URL или при ошибке: пустой список (в sitemap остаются обычные страницы).
 *  Из ответа берутся только записи с допустимым типом и числовым id: адрес страницы собирается из этих полей. */
export async function fetchSitemapRecords(): Promise<SitemapRecord[]> {
  const base = process.env.INTERNAL_API_URL?.trim().replace(/\/+$/, "")
  if (!base) return []
  try {
    const res = await fetch(`${base}/api/v1/feed/public/sitemap`, { signal: AbortSignal.timeout(5000), next: { revalidate: 600 } })
    if (!res.ok) return []
    const data = await res.json()
    if (!Array.isArray(data)) return []
    return data.filter((r): r is SitemapRecord => !!r && TYPE_RE.test(String(r.type)) && Number.isInteger(r.id) && r.id > 0)
  } catch {
    return []
  }
}
