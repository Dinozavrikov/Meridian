import { pageMetadata } from "@/lib/page-meta"

export const metadata = pageMetadata("/roadmap", "page.roadmap.title", "meta.roadmap.description")

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
