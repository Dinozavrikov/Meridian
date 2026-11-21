import { fetchEntityCore } from "@/lib/feed-server"
import { ogCard } from "@/lib/og-card"
import { OG_SIZE, SITE_NAME } from "@/lib/page-meta"
import { renderOgCard } from "@/lib/og-render"

export const size = OG_SIZE
export const contentType = "image/png"
export const alt = SITE_NAME

export default async function Image({ params }: { params: Promise<{ type: string; id: string }> }) {
  const { type, id } = await params
  return renderOgCard(ogCard(await fetchEntityCore(type, id), type))
}
