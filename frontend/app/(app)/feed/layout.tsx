import type { Metadata } from "next"
import { STRINGS } from "@/lib/i18n/strings"
import { shareMetadata } from "@/lib/page-meta"

const title = STRINGS["feed.meta.title"]
const description = STRINGS["feed.meta.description"]

export const metadata: Metadata = {
  title, description, alternates: { canonical: "/feed" },
  ...shareMetadata("/feed", title, description),
}

export default function FeedLayout({ children }: { children: React.ReactNode }) {
  return children
}
