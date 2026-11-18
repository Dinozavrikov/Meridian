import type { Metadata } from "next"
import { STRINGS } from "@/lib/i18n/strings"

export const metadata: Metadata = {
  title: STRINGS["feed.meta.title"],
  description: STRINGS["feed.meta.description"],
  alternates: { canonical: "/feed" },
  openGraph: { title: STRINGS["feed.meta.title"], description: STRINGS["feed.meta.description"], url: "/feed" },
}

export default function FeedLayout({ children }: { children: React.ReactNode }) {
  return children
}
