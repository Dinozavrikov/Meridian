import { pageMetadata } from "@/lib/page-meta"

export const metadata = pageMetadata("/labs", "page.labs.title", "meta.labs.description")

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
