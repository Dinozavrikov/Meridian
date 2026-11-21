import { STRINGS } from "@/lib/i18n/strings"
import { typeColor } from "@/lib/theme"
import { plain } from "@/lib/feed-groups"
import { SITE_NAME } from "@/lib/page-meta"

export const OG_SIZE = { width: 1200, height: 630 } as const

const BRAND_COLOR = "#8892A6"
const MAX_TITLE = 150

export interface OgCard { label: string; title: string; color: string; fontSize: number }

const clip = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`)
const sizeFor = (n: number) => (n <= 60 ? 68 : n <= 110 ? 56 : 46)

/** Что нарисовать на картинке записи. Текст показывает только публичная запись; для остальных
 *  и для несуществующих рисуется бренд без чужого текста. Автор на картинку не попадает. */
export function ogCard(core: Record<string, any> | null, type: string): OgCard {
  const brand: OgCard = { label: "", title: SITE_NAME, color: BRAND_COLOR, fontSize: 96 }
  if (!core || core.visibility !== "public") return brand
  const heading = plain(core.title) || plain(core.preview)   // у убеждения заголовка нет, служит текст
  if (!heading) return brand
  const title = clip(heading, MAX_TITLE)
  return {
    label: (STRINGS as Record<string, string>)[`entityType.${type}`] ?? "",
    title,
    color: typeColor[type] ?? BRAND_COLOR,
    fontSize: sizeFor(title.length),
  }
}
