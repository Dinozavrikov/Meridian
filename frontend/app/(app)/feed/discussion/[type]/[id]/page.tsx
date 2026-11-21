import { fetchEntityGroup } from "@/lib/feed-server"
import type { FeedGroup } from "@/lib/feed-groups"
import { DiscussionClient } from "./discussion-client"

/** Серверная часть страницы обсуждения: забирает группу записи, чтобы ее текст был в HTML.
 *  Для непубличной записи сервер получает 404 и передает null, клиент грузит ее сам, с куками. */
export default async function DiscussionPage({ params }: { params: Promise<{ type: string; id: string }> }) {
  const { type, id } = await params
  const group = (await fetchEntityGroup(type, id)) as FeedGroup | null
  return <DiscussionClient type={type} id={id} initialGroup={group} />
}
