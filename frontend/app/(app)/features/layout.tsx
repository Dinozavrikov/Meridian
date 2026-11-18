import { pageMetadata } from "@/lib/page-meta"

export const metadata = pageMetadata("/features", "page.features.title", "meta.features.description")

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
