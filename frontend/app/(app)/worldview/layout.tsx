import { pageMetadata } from "@/lib/page-meta"

export const metadata = pageMetadata("/worldview", "page.worldview.title", "meta.worldview.description")

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
