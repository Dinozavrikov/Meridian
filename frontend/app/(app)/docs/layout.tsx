import { pageMetadata } from "@/lib/page-meta"

export const metadata = pageMetadata("/docs", "docsPage.pageTitle", "meta.docs.description")

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
