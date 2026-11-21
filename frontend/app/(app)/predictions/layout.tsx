import { pageMetadata } from "@/lib/page-meta"

export const metadata = pageMetadata("/predictions", "page.predictions.title", "meta.predictions.description")

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
