import { ogCard } from "@/lib/og-card"
import { renderOgCard } from "@/lib/og-render"

// Общая картинка сайта для страниц без картинки своей записи. Статическая: рисуется при сборке,
// поэтому отдается целиком (с Content-Length) и с кэшем, а не потоком на каждый запрос.
export const dynamic = "force-static"

export async function GET() {
  const res = await renderOgCard(ogCard(null, ""))
  const buffer = await res.arrayBuffer()
  const headers = new Headers(res.headers)
  headers.set("Content-Length", buffer.byteLength.toString())
  headers.set("Cache-Control", "public, max-age=86400, immutable")
  return new Response(buffer, { headers })
}
