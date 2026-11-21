import type { MetadataRoute } from "next"
import { PRERENDERED_PATHS } from "@/lib/guest-access"
import { fetchSitemapRecords } from "@/lib/feed-server"

// Страницы с готовым серверным текстом (PRERENDERED_PATHS в lib/guest-access.ts) и публичные записи (их отдает backend).
// Клиентские списки, вход и регистрация сюда не попадают: у них нет текста для поисковика или они закрыты в robots.
// Динамически: при сборке образа backend недоступен, и записи не попали бы в sitemap.
export const dynamic = "force-dynamic"

const BASE_URL = "https://miridin.com"

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const paths = PRERENDERED_PATHS   // /feed уже здесь: корень "/" редиректит на него и в sitemap не нужен
  const pages: MetadataRoute.Sitemap = Array.from(new Set(paths)).map(path => ({
    url: `${BASE_URL}${path}`,
    changeFrequency: "weekly" as const,
    priority: path === "/feed" ? 1 : 0.7,
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
