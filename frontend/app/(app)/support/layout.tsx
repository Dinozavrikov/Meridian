import { pageMetadata } from "@/lib/page-meta"

export const metadata = pageMetadata("/support", "support.pageTitle", "meta.support.description")

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
