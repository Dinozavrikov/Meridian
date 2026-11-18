import { FeedPageClient } from "@/components/feed/feed-page-client"
import { fetchPublicFeedFirstPage } from "@/lib/feed-server"

// Динамическая страница: при сборке образа backend недоступен, и в кэш попала бы пустая лента.
// Сам запрос к backend кэшируется на FEED_REVALIDATE_SECONDS.
export const dynamic = "force-dynamic"

export default async function FeedPage() {
  const initialPage = await fetchPublicFeedFirstPage()
  return <FeedPageClient initialPage={initialPage} />
}
