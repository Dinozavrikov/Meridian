import { ogCard } from "@/lib/og-card"
import { renderOgCard } from "@/lib/og-render"

// Общая картинка сайта для страниц без картинки своей записи. Статическая: рисуется при сборке,
// поэтому отдается целиком (с Content-Length) и с кэшем, а не потоком на каждый запрос.
export const dynamic = "force-static"

export async function GET() {
  return renderOgCard(ogCard(null, ""))
}
