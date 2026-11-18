import { pageMetadata } from "@/lib/page-meta"

export const metadata = pageMetadata("/terms", "termsPage.pageTitle", "meta.terms.description")

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
