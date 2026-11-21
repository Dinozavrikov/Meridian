import type { Metadata } from "next"
import { STRINGS } from "@/lib/i18n/strings"
import { SITE_NAME } from "@/lib/page-meta"
import { articleJsonLd } from "@/lib/seo-jsonld"
import { safeJsonLd } from "@/lib/json-ld"
import { plain } from "@/lib/feed-groups"
import { fetchEntityCore } from "@/lib/feed-server"

type Props = { params: Promise<{ type: string; id: string }>; children: React.ReactNode }

/** Метаданные записи берутся из самой записи. Индексируется только публичная; остальное (в том числе когда сервер
 *  записи не увидел) получает noindex. Автор в метатеги не попадает. */
export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  const { type, id } = await params
  const core = await fetchEntityCore(type, id)
  // У записи без заголовка (убеждение) заголовком служит сам текст.
  const heading = core ? plain(core.title) || plain(core.preview) : ""
  if (!core || !heading || core.visibility !== "public") {
    return { title: STRINGS["discussion.meta.fallbackTitle"], robots: { index: false, follow: false } }
  }
  const title = `${heading.slice(0, 70)} · ${SITE_NAME}`
  const description = plain(core.preview).slice(0, 160) || STRINGS["discussion.meta.fallbackDescription"]
  const path = `/feed/discussion/${type}/${id}`
  return {
    title, description, alternates: { canonical: path },
    openGraph: { title, description, url: path, type: "article", siteName: SITE_NAME },
    twitter: { card: "summary_large_image", title, description },
  }
}

export default async function Layout({ params, children }: Props) {
  const { type, id } = await params
  const data = articleJsonLd(await fetchEntityCore(type, id), type, id)
  return (
    <>
      {data && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(data) }} />}
      {children}
    </>
  )
}
