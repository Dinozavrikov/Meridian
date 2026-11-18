import type { MetadataRoute } from "next"
import { GUEST_ALLOWED } from "@/lib/guest-access"
import { fetchSitemapRecords } from "@/lib/feed-server"

// Страницы без логина берутся из lib/guest-access.ts, публичные записи отдает backend.
// Динамически: при сборке образа backend недоступен, и записи не попали бы в sitemap.
export const dynamic = "force-dynamic"

const BASE_URL = "https://miridin.com"

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const paths = ["/", ...GUEST_ALLOWED.filter(p => p !== "/feed")]
  // "/" уже редиректит на /feed, поэтому не дублируем /feed отдельно от корня
  const pages: MetadataRoute.Sitemap = Array.from(new Set(paths)).map(path => ({
    url: `${BASE_URL}${path}`,
    lastModified: new Date(),
    changeFrequency: "weekly" as const,
    priority: path === "/" ? 1 : 0.7,
  }))
  const records: MetadataRoute.Sitemap = (await fetchSitemapRecords()).map(r => {
    const when = new Date(r.updated_at)
    return {
      url: `${BASE_URL}/feed/discussion/${r.type}/${r.id}`,
      lastModified: Number.isNaN(when.getTime()) ? undefined : when,
      changeFrequency: "weekly" as const,
      priority: 0.5,
    }
  })
  return [...pages, ...records]
}
