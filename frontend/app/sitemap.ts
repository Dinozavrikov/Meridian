import type { MetadataRoute } from "next"
import { GUEST_ALLOWED } from "@/lib/guest-access"

// Единый источник страниц, доступных без логина — берём из lib/guest-access.ts,
// чтобы sitemap обновлялся автоматически при добавлении нового гостевого пути,
// без отдельного места для правки.
const BASE_URL = "https://miridin.com"

export default function sitemap(): MetadataRoute.Sitemap {
  const paths = ["/", ...GUEST_ALLOWED.filter(p => p !== "/feed")]
  // "/" уже редиректит на /feed, поэтому не дублируем /feed отдельно от корня
  const uniquePaths = Array.from(new Set(paths))

  return uniquePaths.map(path => ({
    url: `${BASE_URL}${path}`,
    lastModified: new Date(),
    changeFrequency: "weekly" as const,
    priority: path === "/" ? 1 : 0.7,
  }))
}
