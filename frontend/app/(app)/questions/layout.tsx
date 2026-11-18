import { pageMetadata } from "@/lib/page-meta"

export const metadata = pageMetadata("/questions", "page.questions.title", "meta.questions.description")

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
