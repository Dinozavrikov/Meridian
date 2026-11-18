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
