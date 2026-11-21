import type { Metadata } from "next"
import { STRINGS } from "@/lib/i18n/strings"
import { SITE_NAME } from "@/lib/page-meta"

export const metadata: Metadata = {
  title: STRINGS["feed.meta.title"],
  description: STRINGS["feed.meta.description"],
  alternates: { canonical: "/feed" },
  openGraph: { title: STRINGS["feed.meta.title"], description: STRINGS["feed.meta.description"], url: "/feed", siteName: SITE_NAME },
  twitter: { card: "summary", title: STRINGS["feed.meta.title"], description: STRINGS["feed.meta.description"] },
}

export default function FeedLayout({ children }: { children: React.ReactNode }) {
  return children
}
