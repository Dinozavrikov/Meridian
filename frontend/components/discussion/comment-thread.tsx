"use client"
import Link from "next/link"
import { useContext, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Reply as ReplyIcon, Repeat, Trash2 } from "lucide-react"
import { CommentRepostModal } from "./comment-repost-modal"
import { theme } from "@/lib/theme"
import { RichContent } from "./rich-content"
import { Avatar, avatarHue } from "@/components/ui/avatar"
import { useTranslatedField } from "@/lib/i18n/useContentT"
import { api } from "@/lib/api"
import { askConfirm } from "@/lib/confirm"
import { useT } from "@/lib/i18n/useT"
import { DiscussionContext } from "@/components/discussion/discussion-context"

const STANCE_COLOR: Record<string, string> = { confirm: "#27AE60", neutral: "#8b91a8", refute: "#E74C3C" }

function timeAgo(d: string, t: (key: string, vars?: Record<string, string | number>) => string) {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000)
  if (s < 60) return t("discussion.timeNow")
  if (s < 3600) return t("discussion.timeMin", { n: Math.floor(s / 60) })
  if (s < 86400) return t("discussion.timeHour", { n: Math.floor(s / 3600) })
  return t("discussion.timeDay", { n: Math.floor(s / 86400) })
}

const countReplies = (xs: any[] | undefined): number => (xs ?? []).reduce((n, r) => n + 1 + countReplies(r.replies), 0)

function CommentCard({ c, onReply, currentUserId }: { c: any; onReply: (c: any) => void; currentUserId?: number }) {
  const [repostOpen, setRepostOpen] = useState(false)
  const stanceColor = STANCE_COLOR[c.stance] ?? theme.ln2
  const name = c.author_display || c.author_username
  const h = avatarHue(name)
  const isOwn = currentUserId !== undefined && currentUserId === c.author_id
  const translatedContent = useTranslatedField("comment", c.id, "content", c.content, isOwn)
  const t = useT()
  const qc = useQueryClient()
  const { inLab } = useContext(DiscussionContext)
  const del = useMutation({
    mutationFn: () => api.delete(`/api/v1/comments/${c.id}`).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["comments", c.entity_type, c.entity_id] })
      qc.invalidateQueries({ queryKey: ["feed"] })     // счётчик обсуждения на карточке
      qc.invalidateQueries({ queryKey: ["unread"] })
    },
  })
  const nReplies = countReplies(c.replies)
  const onDelete = async () => {
    // Удаление необратимо, а ответы других людей уходят вместе с комментарием (каскад) — подтверждение говорит об этом.
    const description = [
      nReplies > 0 ? t("discussion.deleteWithReplies", { n: nReplies }) : "",
      inLab ? t("discussion.deleteSnapshots") : "",
    ].filter(Boolean).join(" ") || undefined
    if (await askConfirm({ title: t("discussion.deleteConfirm"), description, confirmLabel: t("confirm.delete"), tone: "danger" })) del.mutate()
  }

  return (
    <div style={{
      borderRadius: 10, padding: "12px 14px 11px",
      background: c.stance ? `${stanceColor}0c` : theme.bg1,
      border: `1px solid ${theme.ln1}`, borderLeft: `2.5px solid ${stanceColor}`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
        <Link href={`/profile/${c.author_username}`}>
          <Avatar name={name} avatarUrl={c.author_avatar_url} size={44} />
        </Link>
        <Link href={`/profile/${c.author_username}`}
          style={{ fontSize: 15, fontWeight: 700, color: `hsl(${h},45%,62%)`, transition: "color 0.12s" }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = `hsl(${h},55%,72%)`}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = `hsl(${h},45%,62%)`}
        >
          {name}
        </Link>
        <span style={{ marginLeft: "auto", fontFamily: theme.mono, fontSize: 10, color: theme.tx4, flexShrink: 0 }}>{timeAgo(c.created_at, t)}</span>
      </div>
      <div style={{ fontSize: 12.5, color: theme.tx2, lineHeight: 1.55, marginBottom: 8 }}><RichContent text={translatedContent} stanceColor={stanceColor} /></div>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <button onClick={() => onReply(c)} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: theme.tx4, background: "none", border: "none" }}>
          <ReplyIcon size={12} /> {t("discussion.reply")}
        </button>
        <button onClick={() => setRepostOpen(true)} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: theme.tx4, background: "none", border: "none" }}>
          <Repeat size={12} /> {t("discussion.repost")}
        </button>
        {isOwn && (
          <button type="button" data-testid="comment-delete" onClick={onDelete} disabled={del.isPending}
            style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: theme.tx4, background: "none", border: "none", marginLeft: "auto" }}>
            <Trash2 size={12} /> {t("commentsPanel.deleteAction")}
          </button>
        )}
      </div>
      {repostOpen && (
        <CommentRepostModal commentId={c.id} content={c.content} authorName={c.author_display || c.author_username} onClose={() => setRepostOpen(false)} />
      )}
    </div>
  )
}

export function CommentThread({ comment, onReply, currentUserId }: { comment: any; onReply: (c: any) => void; currentUserId?: number }) {
  return (
    <div style={{ marginTop: 12 }}>
      <CommentCard c={comment} onReply={onReply} currentUserId={currentUserId} />
      {comment.replies?.map((r: any) => (
        <div key={r.id} style={{ marginTop: 8, marginLeft: 16, paddingLeft: 12, borderLeft: `1px dashed ${theme.ln2}` }}>
          <CommentCard c={r} onReply={onReply} currentUserId={currentUserId} />
        </div>
      ))}
    </div>
  )
}
