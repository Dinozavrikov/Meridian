"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Globe, StickyNote, Users } from "lucide-react"
import { discussionApi } from "@/lib/api"
import { useT } from "@/lib/i18n/useT"
import { theme } from "@/lib/theme"
import { splitPersonalNotes } from "@/lib/discussion-notes"
import { useMarkSeen } from "@/lib/use-unread"
import { useStore } from "@/lib/store"
import { DiscussionContext } from "@/components/discussion/discussion-context"
import { SentimentMeter } from "@/components/discussion/sentiment-meter"
import { Courtroom } from "@/components/discussion/courtroom"
import { StanceComposer } from "@/components/discussion/stance-composer"

function countParticipants(comments: any[]): number {
  const names = new Set<string>()
  const walk = (list: any[]) => list.forEach(c => { names.add(c.author_username); if (c.replies?.length) walk(c.replies) })
  walk(comments)
  return names.size
}

/** Обсуждение записи: баланс позиций, суд, форма позиции. Общая панель страницы дискуссии и вкладки «Обсуждение» на
 *  странице записи. ownerUsername передают только владельцу: бэкенд отдаёт ему и личные заметки, панель их отделяет
 *  (lib/discussion-notes). Остальным личных заметок не приходит, отделять нечего. Открытие панели = «прочитано». */
export function DiscussionPanel({ type, entityId, ownerUsername, notesHref, readOnly = false, inLab = false }: {
  type: string; entityId: number; ownerUsername?: string; notesHref?: string; readOnly?: boolean; inLab?: boolean
}) {
  const t = useT()
  const qc = useQueryClient()
  const user = useStore(s => s.user)
  const [replyTo, setReplyTo] = useState<any | null>(null)

  const { data: comments = [], isLoading } = useQuery({
    queryKey: ["comments", type, entityId],
    queryFn: () => discussionApi.comments(type, entityId),
  })
  const post = useMutation({
    mutationFn: (d: { content: string; stance: string }) =>
      discussionApi.post(type, entityId, { ...d, parent_id: replyTo?.id ?? null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["comments", type, entityId] })
      qc.invalidateQueries({ queryKey: ["feed"] })
      setReplyTo(null)
    },
  })

  const markSeen = useMarkSeen()
  useEffect(() => {
    if (!user || isLoading) return   // отметка только после загрузки: иначе она обгонит список
    markSeen.mutate({ entityType: type, entityId })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, isLoading, type, entityId])

  const { discussion, personal } = splitPersonalNotes<any>(comments, ownerUsername)
  const isOwner = !!user && !!ownerUsername && user.username === ownerUsername
  const participants = countParticipants(discussion)

  return (
    <DiscussionContext.Provider value={{ inLab }}>
    <div data-testid="discussion-panel">
      {!isLoading && (
        <div style={{ marginBottom: 22 }}>
          <SentimentMeter comments={discussion} />
          {participants > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 12, fontSize: 11, color: theme.tx4 }}>
              <Users size={13} /> {t(participants === 1 ? "discussion.participants.one" : "discussion.participants.many", { n: participants })}
            </div>
          )}
        </div>
      )}

      {isLoading ? (
        <div style={{ fontSize: 13, color: theme.tx4, textAlign: "center", padding: "40px 0" }}>{t("discussion.loading")}</div>
      ) : (
        <Courtroom comments={discussion} onReply={setReplyTo} currentUserId={user?.id} />
      )}

      {notesHref && isOwner && personal.length > 0 && (
        <Link href={notesHref} data-testid="my-notes-link"
          style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 18, fontSize: 12.5, color: theme.tx3 }}>
          <StickyNote size={13} /> {t("discussion.myNotes", { n: personal.length })}
        </Link>
      )}

      {readOnly ? null : user ? (
        <StanceComposer
          onSubmit={(content, stance) => post.mutate({ content, stance })}
          loading={post.isPending}
          replyTo={replyTo ? { author: replyTo.author_display || replyTo.author_username } : null}
          onCancelReply={() => setReplyTo(null)}
        />
      ) : (
        <div style={{
          marginTop: 30, paddingTop: 22, borderTop: `1px solid ${theme.ln1}`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexWrap: "wrap", gap: 14,
          background: "#0d1410", border: "1px solid #27AE6025", borderRadius: 10,
          padding: "16px 20px",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Globe size={14} style={{ color: "#27AE60", flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: theme.tx2 }}>{t("discussion.guestNotice")}</span>
          </div>
          <Link href="/register" style={{
            fontSize: 12.5, fontWeight: 600, color: "#0b0d14", background: "#27AE60",
            borderRadius: 8, padding: "8px 16px", textDecoration: "none", flexShrink: 0,
          }}>
            {t("discussion.register")}
          </Link>
        </div>
      )}
    </div>
    </DiscussionContext.Provider>
  )
}
