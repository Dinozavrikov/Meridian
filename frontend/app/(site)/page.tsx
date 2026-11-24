import { pageMetadata } from "@/lib/page-meta"
import { HomeContent } from "@/components/site/home-content"

// Главная: свой адрес и свой canonical, раньше здесь был редирект на ленту.
export const metadata = pageMetadata("/", "footer.tagline", "site.description")

export default function HomePage() {
  return <HomeContent />
}
