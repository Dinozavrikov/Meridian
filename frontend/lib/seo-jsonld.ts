import { plain } from "@/lib/feed-groups"
import { SITE_NAME } from "@/lib/page-meta"

const ORIGIN = "https://miridin.com"

/** Данные Article для публичной записи (в script их превращает safeJsonLd). Автора в них нет:
 *  имя человека в метаданные не попадает. Для непубличной и пустой записи null. */
export function articleJsonLd(core: Record<string, any> | null, type: string, id: string): Record<string, unknown> | null {
  if (!core || core.visibility !== "public") return null
  const headline = plain(core.title) || plain(core.preview)   // у убеждения заголовка нет, служит текст
  if (!headline) return null
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: headline.slice(0, 110),
    mainEntityOfPage: `${ORIGIN}/feed/discussion/${type}/${id}`,
    publisher: { "@type": "Organization", name: SITE_NAME, url: ORIGIN },
  }
  const description = plain(core.preview).slice(0, 300)
  if (description) data.description = description
  if (core.created_at) data.datePublished = core.created_at
  if (core.updated_at) data.dateModified = core.updated_at
  return data
}
