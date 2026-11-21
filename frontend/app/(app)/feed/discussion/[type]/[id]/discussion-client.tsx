"use client"
import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { Header } from "@/components/layout/header"
import { PageShell, PageContent } from "@/components/layout/page-shell"
import { feedApi } from "@/lib/api"
import { useT } from "@/lib/i18n/useT"
import { theme } from "@/lib/theme"
import { safeEntityHref } from "@/lib/entity-routes"
import { FeedGroupCard } from "@/components/feed/feed-group-card"
import { FeedStyles } from "@/components/feed/feed-styles"
import { DiscussionPanel } from "@/components/discussion/discussion-panel"
import type { FeedGroup } from "@/lib/feed-groups"

/** Страница обсуждения записи: карточка записи целиком (текст, все связи и заметки), под ней обсуждение.
 *  initialGroup: группа, отрисованная на сервере (анонимный запрос, только публичная запись). Она нужна,
 *  чтобы текст записи был в HTML для поисковиков; для человека считается устаревшей и сразу обновляется. */
export function DiscussionClient({ type, id, initialGroup }: { type: string; id: string; initialGroup: FeedGroup | null }) {
  const entityId = Number(id)
  const t = useT()

  const { data: group, isLoading } = useQuery({
    queryKey: ["feed", "group-entity", type, entityId],   // под префиксом "feed": новый комментарий обновляет и счетчик
    queryFn: () => feedApi.groupEntity(type, entityId),
    retry: false,
    initialData: initialGroup ?? undefined,
    initialDataUpdatedAt: 0,   // серверные данные анонимные: показать сразу, но тут же перезапросить с правами человека
  })
  const owner = group?.core?.author_username as string | undefined

  return (
    <PageShell>
      <Header titleKey="page.discussion.title" />
      <PageContent>
        <FeedStyles />
        <div style={{ maxWidth: 760, margin: "0 auto", width: "100%" }}>
          <Link href="/feed" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: theme.tx3, marginBottom: 18 }}>
            <ArrowLeft size={13} /> {t("discussion.backToFeed")}
          </Link>

          {isLoading ? (
            <div style={{ height: 140, borderRadius: 14, background: theme.bg1, border: `1px solid ${theme.ln1}`, marginBottom: 22 }} />
          ) : group ? (
            <>
              <FeedGroupCard group={group} full />
              <DiscussionPanel type={type} entityId={entityId} ownerUsername={owner} notesHref={safeEntityHref(type, entityId)} inLab={!!group.core?.lab_id} />
            </>
          ) : (
            <div style={{ fontSize: 13, color: theme.tx4, marginBottom: 22 }}>{t("discussion.notFound")}</div>
          )}
        </div>
      </PageContent>
    </PageShell>
  )
}
