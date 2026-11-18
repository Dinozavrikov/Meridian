import type { Metadata } from "next"
import { STRINGS } from "@/lib/i18n/strings"
import { plain } from "@/lib/feed-groups"
import { fetchEntityCore } from "@/lib/feed-server"

type Props = { params: Promise<{ type: string; id: string }>; children: React.ReactNode }

/** Метаданные записи берутся из самой записи. Индексируется только публичная; остальное (в том числе когда сервер
 *  записи не увидел) получает noindex. Автор в метатеги не попадает. */
export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  const { type, id } = await params
  const core = await fetchEntityCore(type, id)
  const heading = core ? plain(core.title) : ""
  if (!core || !heading || core.visibility !== "public") {
    return { title: STRINGS["discussion.meta.fallbackTitle"], robots: { index: false, follow: false } }
  }
  const title = `${heading.slice(0, 70)} · Meridian`
  const description = plain(core.preview).slice(0, 160) || STRINGS["discussion.meta.fallbackDescription"]
  const path = `/feed/discussion/${type}/${id}`
  return { title, description, alternates: { canonical: path }, openGraph: { title, description, url: path, type: "article" } }
}

export default function Layout({ children }: Pick<Props, "children">) {
  return children
}
