import { pageMetadata } from "@/lib/page-meta"

export const metadata = pageMetadata("/hypotheses", "page.hypotheses.title", "meta.hypotheses.description")

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
