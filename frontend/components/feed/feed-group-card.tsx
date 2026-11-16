"use client"
import { useEffect, useState, type CSSProperties } from "react"
import Link from "next/link"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Check, ChevronDown, ChevronUp, Globe, Link2, MessageCircle, Pencil, Repeat, StickyNote, X } from "lucide-react"
import { parseEntityDate, statusColor, typeColor } from "@/lib/theme"
import { useStore } from "@/lib/store"
import { useT } from "@/lib/i18n/useT"
import { useTypeRu } from "@/lib/i18n/useTypeRu"
import { useDynamicTranslate } from "@/lib/i18n/useDynamicT"
import { collectStrings } from "@/lib/i18n/collect-strings"
import { useContentT, type ContentTranslateItem } from "@/lib/i18n/useContentT"
import { safeEntityHref, type EntityType } from "@/lib/entity-routes"
import { formatFeedTime } from "@/lib/feed-time"
import { askConfirmText } from "@/lib/confirm"
import { toast } from "@/lib/toast"
import { obsApi, hypApi, predApi, wvApi, questionApi, taskApi, trashApi } from "@/lib/api"
import { Avatar } from "@/components/ui/avatar"
import { EntityQuickAddMenu } from "@/components/entities/entity-quick-add-menu"
import { RepostModal } from "@/components/feed/repost-modal"
import { RepostQuote } from "@/components/feed/repost-quote"
import { MaturationStepper } from "@/components/feed/maturation-stepper"
import { VerifyTrack } from "@/components/feed/verify-track"
import { GroupGraph } from "@/components/feed/group-graph"
import { REL_COLOR, evidenceBalance, nextCheck } from "@/lib/feed-dossier"
import {
  MEMBERS_COLLAPSED, UPDATED_GAP_MS, plain, relationKind, splitMembers, type FeedGroup, type FeedItem, type FeedNote, type FeedRef, type RelationKind,
} from "@/lib/feed-groups"

const ENTITY_API: Record<string, { delete: (id: number) => Promise<any> }> = {
  observation: obsApi, hypothesis: hypApi, prediction: predApi, worldview: wvApi, question: questionApi, task: taskApi,
}
const QUICK_ADD = new Set(["observation", "hypothesis", "prediction", "worldview", "question"])
const NEUTRAL = "#8892A6"
const AVATAR_SIZE = 40   // крупный аватар: автор — часть доверия к записи, а не мелкая подпись
const cvar = (c: string): CSSProperties => ({ ["--c" as string]: c })

function RelationMark({ kind, label }: { kind: RelationKind; label: string }) {
  const Icon = kind === "confirm" ? Check : kind === "refute" ? X : Link2
  return (
    <span className="mf-mark" data-testid="relation-mark" data-kind={kind} style={cvar(REL_COLOR[kind])}
      role="img" aria-label={label} title={label}>
      <Icon size={12} aria-hidden="true" />
    </span>
  )
}

function MemberRow({ item, kind, label, text, typeLabel }: {
  item: FeedItem; kind: RelationKind; label: string; text: string; typeLabel: string
}) {
  return (
    <Link href={safeEntityHref(item.type, item.entity_id)} className="mf-row" data-testid="feed-member">
      <RelationMark kind={kind} label={label} />
      <span className="mf-row-t">{text}</span>
      {(item.note_count ?? 0) > 0 && (
        <span className="mf-count"><StickyNote size={11} aria-hidden="true" />{item.note_count}</span>
      )}
      {(item.comment_count ?? 0) > 0 && (
        <span className="mf-count"><MessageCircle size={11} aria-hidden="true" />{item.comment_count}</span>
      )}
      <span className="mf-chip" style={cvar(typeColor[item.type] ?? NEUTRAL)}>{typeLabel}</span>
    </Link>
  )
}

/** full — карточка на странице обсуждения: всё раскрыто, текст целиком, без кнопки «Обсуждение» (мы уже на ней). */
export function FeedGroupCard({ group, isNew = false, onTopic, full = false }: {
  group: FeedGroup; isNew?: boolean; onTopic?: (topic: string) => void; full?: boolean
}) {
  const t = useT()
  const typeRu = useTypeRu() as Record<string, string>
  const user = useStore(s => s.user)
  const locale = useStore(s => s.locale) as string | undefined
  const qc = useQueryClient()
  const { ct, ensure } = useContentT()
  const { core, members } = group
  const [expanded, setExpanded] = useState(full)
  const [internalOpen, setInternalOpen] = useState(full)
  const [repostOpen, setRepostOpen] = useState(false)
  const [guestPromptOpen, setGuestPromptOpen] = useState(false)

  // Системные слова (статус записи, свои типы связей из словаря бэкенда) переводятся динамическим каналом;
  // пользовательский текст записей — контентным (ct/ensure ниже).
  const customRelations = [...members.map(m => m.relation), ...group.internal.map(l => l.kind)]
    .filter(r => relationKind(r) === "other")
  const dt = useDynamicTranslate(collectStrings([core.status ?? "", ...customRelations].filter(Boolean)))
  const relLabel = (rel: string) => {
    const k = relationKind(rel)
    return k === "confirm" ? t("linkType.confirms") : k === "refute" ? t("linkType.refutes")
      : k === "neutral" ? t("linkType.related") : dt(rel)
  }

  const timeOf = (iso: string) => { const d = parseEntityDate(iso); return d ? formatFeedTime(d, new Date(), locale) : "" }
  const checkDay = (d: Date) => {
    const sameYear = d.getFullYear() === new Date().getFullYear()
    return d.toLocaleDateString(locale || "ru-RU", sameYear ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" })
  }

  const isOwn = (it: FeedItem) => !!user && user.username === it.author_username
  const own = isOwn(core)
  const href = safeEntityHref(core.type, core.entity_id)
  const isHyp = core.type === "hypothesis"
  const typeC = typeColor[core.type] ?? NEUTRAL
  const authorName = core.author_display || core.author_username
  const profileHref = `/profile/${core.author_username}`

  // Названия в «связях между участниками» и «Ещё связано с»: переводятся только настоящие заголовки чужих записей
  // (translatable — title не слепок превью; свои записи не переводятся никогда).
  const refTranslatable = (r: FeedRef) => !!r.translatable && !!r.title && !(user && user.username === r.author_username)
  const refTitle = (r: FeedRef) => (refTranslatable(r) ? ct(r.type, r.entity_id, "title", r.title) : r.title) || "…"

  // Чужие записи (ядро и участники) переводятся контентным движком; свои — никогда.
  useEffect(() => {
    const items: ContentTranslateItem[] = []
    for (const it of [core, ...members.map(m => m.item)]) {
      if (isOwn(it)) continue
      if (it.title) items.push({ entityType: it.type, entityId: it.entity_id, field: "title", text: it.title })
      const pv = plain(it.preview)
      if (pv) items.push({ entityType: it.type, entityId: it.entity_id, field: "preview", text: pv })
    }
    if (core.type === "observation") {   // заметки к наблюдению: переводятся по автору заметки, а не карточки
      for (const n of core.notes ?? []) {
        if (user && user.username === n.author_username) continue
        if (n.title) items.push({ entityType: "obs_post", entityId: n.id, field: "title", text: n.title })
        const pv = plain(n.preview)
        if (pv) items.push({ entityType: "obs_post", entityId: n.id, field: "preview", text: pv })
      }
    }
    for (const r of [...group.internal.flatMap(l => [l.a, l.b]), ...group.outside]) {
      if (refTranslatable(r)) items.push({ entityType: r.type, entityId: r.entity_id, field: "title", text: r.title })
    }
    if (items.length) ensure(items)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group.key, members.length, core.notes?.length, user?.username])

  const textOf = (it: FeedItem) => {
    if (isOwn(it)) return it.title || plain(it.preview)
    return it.title ? ct(it.type, it.entity_id, "title", it.title) : ct(it.type, it.entity_id, "preview", plain(it.preview))
  }
  const noteText = (n: FeedNote) => {
    const pv = plain(n.preview)
    if (user && user.username === n.author_username) return `${n.title ? `${n.title}. ` : ""}${pv}`
    const title = n.title ? ct("obs_post", n.id, "title", n.title) : ""
    return `${title ? `${title}. ` : ""}${pv ? ct("obs_post", n.id, "preview", pv) : ""}`
  }
  const coreTitle = own ? core.title : ct(core.type, core.entity_id, "title", core.title)
  const corePreview = plain(core.preview)
  const coreText = own ? corePreview : ct(core.type, core.entity_id, "preview", corePreview)
  // У записи без заголовка (убеждение) заголовком служит сам текст, абзаца под ним не нужно.
  const heading = coreTitle || coreText
  const lead = coreTitle ? coreText : ""

  // Обсуждение живёт на странице дискуссии (общая для публичной записи), а не разворачивается внутри карточки.
  const discussionType = (core.repost_source_type as string | undefined) ?? core.type
  const discussionId = (core.repost_source_id as number | undefined) ?? core.entity_id
  const commentCount = core.comment_count ?? 0
  const discussionHref = `/feed/discussion/${discussionType}/${discussionId}`

  // В ленте только публичные и лабораторные записи — удаление затрагивает других людей, поэтому подтверждение ДО
  // действия, а после него «Вернуть» (мягкое удаление: из корзины запись возвращается в любой момент).
  const del = useMutation({
    mutationFn: () => ENTITY_API[core.type].delete(core.entity_id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["feed"] })
      toast({
        message: t("feedCard.deleted"), tone: "success",
        undo: {
          run: async () => {
            await trashApi.restore(core.type, core.entity_id)
            qc.invalidateQueries({ queryKey: ["feed"] })
          },
        },
      })
    },
    onError: (err: any) => {
      // Сервер объясняет отказ сам (например, задача — цель лаборатории): показываем его причину.
      const detail = err?.response?.data?.detail
      toast({ message: typeof detail === "string" ? detail : t("feedCard.deleteFailed"), tone: "error" })
    },
  })
  const handleDelete = async () => {
    if (await askConfirmText(t("feedCard.confirmDelete"), t("feedCard.confirmDeleteLabel"))) del.mutate()
  }

  const bal = evidenceBalance(members)
  const { shown, hidden } = splitMembers(members, expanded)
  const check = nextCheck(group)
  const created = parseEntityDate(core.created_at)
  const active = parseEntityDate(group.activity)
  const showUpdated = !!created && !!active && active.getTime() - created.getTime() > UPDATED_GAP_MS
  const notes = core.type === "observation" ? core.notes ?? [] : []
  const noteCount = core.type === "observation" ? core.note_count ?? 0 : 0
  const ecd = core.expected_check_date as any

  return (
    <article className="mf-card" data-testid="feed-group">
      <header>
        <div className="mf-head-row">
          <Link href={profileHref} className="mf-av" aria-hidden="true" tabIndex={-1}>
            <Avatar name={authorName} size={AVATAR_SIZE} avatarUrl={core.author_avatar_url} />
          </Link>
          <div className="mf-who">
            <Link href={profileHref} className="mf-author" data-testid="feed-author">{authorName}</Link>
            <time className="mf-time" dateTime={core.created_at}>{timeOf(core.created_at)}</time>
          </div>
          {own && (
            <div className="mf-tools">
              <Link href={href} className="mf-icon-btn" title={t("feedCard.editTitle")} aria-label={t("feedCard.editTitle")}>
                <Pencil size={14} aria-hidden="true" />
              </Link>
              {ENTITY_API[core.type] && (
                <button type="button" className="mf-icon-btn" title={t("commentsPanel.deleteAction")}
                  aria-label={t("commentsPanel.deleteAction")} disabled={del.isPending} onClick={handleDelete}>
                  <X size={15} aria-hidden="true" />
                </button>
              )}
            </div>
          )}
        </div>
        <div className="mf-meta">
          <span className="mf-type" style={cvar(typeC)}>
            <i className="mf-dot" aria-hidden="true" />{typeRu[core.type] ?? core.type}
          </span>
          {core.status && (
            <span className="mf-pill" data-testid="feed-status" style={cvar(statusColor[core.status] ?? NEUTRAL)}>{dt(core.status)}</span>
          )}
          {isNew && <span className="mf-new" data-testid="feed-new">{t("feedGroups.newBadge")}</span>}
        </div>
      </header>

      {core.repost_of ? <RepostQuote repostOf={core.repost_of} /> : null}

      <h3 className="mf-title"><Link href={full ? href : discussionHref}>{heading}</Link></h3>
      {lead && (
        <p className="mf-lead"
          style={full ? { display: "block", WebkitLineClamp: "unset", overflow: "visible", whiteSpace: "pre-wrap" } : undefined}>
          {lead}
        </p>
      )}

      {core.type === "observation" && core.status && <div className="mf-stage"><MaturationStepper status={core.status} /></div>}
      {core.type === "prediction" && <div className="mf-stage"><VerifyTrack createdAt={core.created_at} expectedDate={ecd} /></div>}

      {members.length > 0 ? (
        <section className="mf-ev">
          <div>
            <h4 className="mf-h">{isHyp ? t("feedGroups.evidence") : t("feedGroups.related")}</h4>
            {isHyp && (
              <>
                <div className="mf-bal" aria-hidden="true">
                  {bal.confirm > 0 && <i className="mf-seg-ok" data-count={bal.confirm} style={{ flex: bal.confirm }} />}
                  {bal.refute > 0 && <i className="mf-seg-bad" data-count={bal.refute} style={{ flex: bal.refute }} />}
                  {bal.related > 0 && <i className="mf-seg-neu" data-count={bal.related} style={{ flex: bal.related }} />}
                </div>
                <div className="mf-legend" data-testid="feed-legend">
                  {bal.confirm > 0 && <span><b>{bal.confirm}</b> {t("feedGroups.legendConfirm")}</span>}
                  {bal.refute > 0 && <span><b>{bal.refute}</b> {t("feedGroups.legendRefute")}</span>}
                  {bal.related > 0 && <span><b>{bal.related}</b> {t("feedGroups.legendRelated")}</span>}
                </div>
              </>
            )}
            {shown.map(m => (
              <MemberRow key={`${m.item.type}:${m.item.entity_id}`} item={m.item} kind={relationKind(m.relation)}
                label={relLabel(m.relation)} text={textOf(m.item)} typeLabel={typeRu[m.item.type] ?? m.item.type} />
            ))}
            {hidden > 0 && (
              <button type="button" className="mf-link" data-testid="feed-more" onClick={() => setExpanded(true)}>
                <ChevronDown size={12} aria-hidden="true" />{t("feedGroups.moreMembers", { n: hidden })}
              </button>
            )}
            {!full && expanded && members.length > MEMBERS_COLLAPSED + 1 && (
              <button type="button" className="mf-link" data-testid="feed-less" onClick={() => setExpanded(false)}>
                <ChevronUp size={12} aria-hidden="true" />{t("feedGroups.lessMembers")}
              </button>
            )}
          </div>
          <GroupGraph group={group} />
        </section>
      ) : isHyp ? (
        <p className="mf-muted" data-testid="feed-no-evidence">{t("feedGroups.noEvidence")}</p>
      ) : null}

      {noteCount > 0 && (
        <div className="mf-notes" data-testid="feed-group-notes">
          <div className="mf-notes-h"><StickyNote size={12} aria-hidden="true" />{t("feedGroups.notes", { n: noteCount })}</div>
          {notes.map(n => (
            <div key={n.id} className="mf-note" data-testid="feed-note">
              <span style={{ color: "var(--mf-t1)", fontWeight: 600 }}>{n.author_display || n.author_username}</span>{" "}
              <span className="mf-time">{timeOf(n.created_at)}</span>
              <div className="mf-note-q">{noteText(n)}</div>
            </div>
          ))}
          {noteCount > notes.length && (
            <Link href={href} className="mf-link">{t("feedGroups.notesMore", { n: noteCount - notes.length })}</Link>
          )}
        </div>
      )}

      {group.internal.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <button type="button" className="mf-link" data-testid="feed-internal-toggle" onClick={() => setInternalOpen(o => !o)}>
            {internalOpen ? <ChevronUp size={12} aria-hidden="true" /> : <ChevronDown size={12} aria-hidden="true" />}
            {t("feedGroups.betweenMembers", { n: group.internal.length })}
          </button>
          {internalOpen && group.internal.map((l, i) => (
            <div key={i} className="mf-block" data-testid="feed-internal-link">
              <span>{refTitle(l.a)}</span><RelationMark kind={relationKind(l.kind)} label={relLabel(l.kind)} /><span>{refTitle(l.b)}</span>
            </div>
          ))}
        </div>
      )}

      {group.outside.length > 0 && (
        <div className="mf-block" data-testid="feed-outside">
          <Link2 size={12} aria-hidden="true" />{t("feedGroups.alsoLinked")}
          {group.outside.slice(0, 3).map(o => (
            <Link key={`${o.type}:${o.entity_id}`} href={safeEntityHref(o.type, o.entity_id)} className="mf-ref">
              <i className="mf-dot" aria-hidden="true" style={{ ...cvar(typeColor[o.type] ?? NEUTRAL), width: 6, height: 6 }} />
              <span>{refTitle(o)}</span>
            </Link>
          ))}
          {group.outside.length > 3 && <span>{t("feedGroups.alsoLinkedMore", { n: group.outside.length - 3 })}</span>}
        </div>
      )}

      <footer className="mf-foot">
        {!full && (
          <Link href={discussionHref} className="mf-btn" data-testid="feed-discussion"
            aria-label={t("feedGroups.discussionAria", { n: commentCount })}>
            <MessageCircle size={14} aria-hidden="true" /><span className="mf-lbl">{t("feedGroups.discussion")}</span>{commentCount}
          </Link>
        )}

        <span style={{ position: "relative" }}>
          <button type="button" className="mf-btn" aria-label={t("feedCard.repost")}
            onClick={() => (user ? setRepostOpen(true) : setGuestPromptOpen(o => !o))}>
            <Repeat size={14} aria-hidden="true" /><span className="mf-lbl">{t("feedCard.repost")}</span>
          </button>
          {guestPromptOpen && (
            <div className="mf-pop" data-testid="guest-prompt">
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600, color: "var(--mf-ok)" }}>
                <Globe size={12} aria-hidden="true" />{t("feedCard.publicLayer")}
              </span>
              <p>{t("feedCard.repostGuestNotice")}</p>
              <Link href="/register" className="mf-cta">{t("discussion.register")}</Link>
            </div>
          )}
        </span>

        {QUICK_ADD.has(core.type) && (
          <EntityQuickAddMenu entityType={core.type as EntityType} entityId={core.entity_id}
            entityName={core.title || corePreview.slice(0, 80)} />
        )}

        <span className="mf-foot-r">
          {check && (
            <span className="mf-next" data-testid="feed-next-check" data-state={check.state}>
              {t("feedGroups.nextCheck")} · <b>{checkDay(check.date)}</b> ·{" "}
              {check.state === "future" ? t("feedGroups.checkIn", { n: check.days })
                : check.state === "today" ? t("feedGroups.checkToday") : t("feedGroups.checkOverdue", { n: check.days })}
            </span>
          )}
          {showUpdated && active && (
            <span className="mf-updated" data-testid="feed-updated">{t("feedGroups.updated", { when: formatFeedTime(active, new Date(), locale) })}</span>
          )}
          {group.topics.map(tp => (
            <button key={tp} type="button" className="mf-tag" data-testid="feed-topic" onClick={() => onTopic?.(tp)}>#{tp}</button>
          ))}
        </span>
      </footer>

      {repostOpen && (
        <RepostModal sourceType={discussionType} sourceId={discussionId}
          sourceTitle={core.title || corePreview.slice(0, 60)} onClose={() => setRepostOpen(false)} />
      )}
    </article>
  )
}
