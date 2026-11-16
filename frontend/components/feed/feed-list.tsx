"use client"
import { useEffect, type CSSProperties } from "react"
import Link from "next/link"
import { CircleCheck, CircleDot, CircleHelp, CircleX, Clock, Compass, Eye, Lightbulb, Link2, ListChecks, MessageCircle, StickyNote } from "lucide-react"
import { useStore } from "@/lib/store"
import { useT } from "@/lib/i18n/useT"
import { useTypeRu } from "@/lib/i18n/useTypeRu"
import { useDynamicTranslate } from "@/lib/i18n/useDynamicT"
import { collectStrings } from "@/lib/i18n/collect-strings"
import { useContentT, type ContentTranslateItem } from "@/lib/i18n/useContentT"
import { parseEntityDate, statusColor, typeColor } from "@/lib/theme"
import { formatFeedTime } from "@/lib/feed-time"
import { plain, type FeedGroup, type FeedItem } from "@/lib/feed-groups"
import { discussionHref, evidenceCell, verdictIcon, verdictKind, type VerdictIcon } from "@/lib/feed-list"
import { Avatar } from "@/components/ui/avatar"

const NEUTRAL = "#8892A6"
const AVATAR_SIZE = 26   // автор — часть доверия к записи: аватар и имя заметны, а не мелкая подпись
const cvar = (c: string): CSSProperties => ({ ["--c" as string]: c })
type TFn = ReturnType<typeof useT>

const ICONS: Record<VerdictIcon, typeof Eye> = {
  check: CircleCheck, partial: CircleDot, x: CircleX, clock: Clock, eye: Eye,
  help: CircleHelp, task: ListChecks, worldview: Compass, bulb: Lightbulb,
}

/** Итог слева: у гипотезы баланс доказательств, у остальных типов иконка и статус. */
function Verdict({ group, status, t }: { group: FeedGroup; status: string; t: TFn }) {
  const core = group.core
  const kind = verdictKind(group)
  if (kind === "status") {
    const iconKey = verdictIcon(core.type, core.status)
    const Icon = ICONS[iconKey]
    const color = statusColor[core.status ?? ""] ?? typeColor[core.type] ?? NEUTRAL
    return (
      <span className="mfl-verdict" data-testid="feed-list-verdict" data-kind="status" style={cvar(color)}>
        <span className="mfl-ic" data-icon={iconKey}><Icon size={24} aria-hidden="true" /></span>
        <span className="mfl-cap" data-testid="feed-list-status" title={status || undefined}>{status || t("feedList.none")}</span>
      </span>
    )
  }
  const cell = evidenceCell(group)
  if (kind === "none" || cell.kind !== "balance") {
    return (
      <span className="mfl-verdict" data-testid="feed-list-verdict" data-kind="none" role="img" aria-label={t("feedList.noEvidence")}>
        <span className="mfl-dash">{t("feedList.none")}</span>
        <span className="mfl-cap">{t("feedList.noEvidenceShort")}</span>
      </span>
    )
  }
  const b = cell.balance
  const label = t("feedList.balanceLabel", { c: b.confirm, r: b.refute, o: b.related })
  return (
    <span className="mfl-verdict" data-testid="feed-list-verdict" data-kind={kind} role="img" aria-label={label} title={label}>
      {kind === "balance" ? (
        <span className="mfl-score">
          <span className="mfl-score-ok" data-score="confirm">{b.confirm}</span>
          <span className="mfl-score-sep" aria-hidden="true">:</span>
          <span className="mfl-score-bad" data-score="refute">{b.refute}</span>
        </span>
      ) : (
        <span className="mfl-score"><span className="mfl-score-neu" data-score="related">{b.related}</span></span>
      )}
      <span className="mfl-bar">
        {b.confirm > 0 && <span className="mfl-seg mfl-seg-ok" data-seg="confirm" style={{ flexGrow: b.confirm }} />}
        {b.refute > 0 && <span className="mfl-seg mfl-seg-bad" data-seg="refute" style={{ flexGrow: b.refute }} />}
        {b.related > 0 && <span className="mfl-seg mfl-seg-neu" data-seg="related" style={{ flexGrow: b.related }} />}
      </span>
      <span className="mfl-cap">{kind === "balance" ? t("feedList.forAgainst") : t("feedList.relatedCaption")}</span>
    </span>
  )
}

/** Режим «Список»: строка на карточку (ядро), строка ведёт на страницу дискуссии. Слева вердикт, в середине
 *  автор, утверждение и метаданные, справа число комментариев. */
export function FeedList({ groups, isNew }: { groups: FeedGroup[]; isNew: (g: FeedGroup) => boolean }) {
  const t = useT()
  const typeRu = useTypeRu() as Record<string, string>
  const user = useStore(s => s.user)
  const locale = useStore(s => s.locale) as string | undefined
  const { ct, ensure } = useContentT()
  const isOwn = (it: FeedItem) => !!user && user.username === it.author_username
  const dt = useDynamicTranslate(collectStrings(groups.map(g => g.core.status ?? "").filter(Boolean)))

  // Чужие записи переводятся контентным движком (свои — никогда), как в карточке.
  const ensureKey = groups.map(g => g.key).join("|")
  useEffect(() => {
    const items: ContentTranslateItem[] = []
    for (const g of groups) {
      const it = g.core
      if (isOwn(it)) continue
      if (it.title) items.push({ entityType: it.type, entityId: it.entity_id, field: "title", text: it.title })
      else {
        const pv = plain(it.preview)
        if (pv) items.push({ entityType: it.type, entityId: it.entity_id, field: "preview", text: pv })
      }
    }
    if (items.length) ensure(items)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ensureKey, user?.username])

  const textOf = (it: FeedItem) => {
    if (isOwn(it)) return it.title || plain(it.preview)
    return it.title ? ct(it.type, it.entity_id, "title", it.title) : ct(it.type, it.entity_id, "preview", plain(it.preview))
  }

  return (
    <div className="mfl" data-testid="feed-list">
      <ul className="mfl-ul" aria-label={t("feedList.listLabel")}>
        {groups.map(g => {
          const core = g.core
          const active = parseEntityDate(g.activity)
          const authorName = core.author_display || core.author_username
          const comments = core.comment_count ?? 0
          const notes = core.type === "observation" ? core.note_count ?? 0 : 0
          const status = core.status ? dt(core.status) : ""
          const cell = evidenceCell(g)
          const commentsLabel = t("feedList.commentsLabel", { n: comments })
          return (
            <li key={g.key}>
              <Link href={discussionHref(core)} className="mfl-row" data-testid="feed-list-row"
                style={cvar(typeColor[core.type] ?? NEUTRAL)}>
                <Verdict group={g} status={status} t={t} />
                <span className="mfl-main">
                  <span className="mfl-by">
                    <Avatar name={authorName} size={AVATAR_SIZE} avatarUrl={core.author_avatar_url} />
                    <span className="mfl-name" data-testid="feed-list-author">{authorName}</span>
                    <span className="mfl-sep" aria-hidden="true">·</span>
                    <time className="mfl-time" dateTime={g.activity}>{active ? formatFeedTime(active, new Date(), locale) : ""}</time>
                  </span>
                  <span className="mfl-text">{textOf(core)}</span>
                  <span className="mfl-meta">
                    <span className="mfl-typelbl" data-testid="feed-list-type">
                      <span className="mfl-dot" aria-hidden="true" />{typeRu[core.type] ?? core.type}
                    </span>
                    {isNew(g) && <span className="mfl-new" data-testid="feed-list-new">{t("feedList.newMark")}</span>}
                    {core.type === "hypothesis" && status && (
                      <span className="mfl-st" data-testid="feed-list-status" title={status}
                        style={cvar(statusColor[core.status as string] ?? NEUTRAL)}>
                        <span className="mfl-dot" aria-hidden="true" />{status}
                      </span>
                    )}
                    {cell.kind === "links" && (
                      <span className="mfl-cnt" data-testid="feed-list-links" role="img"
                        aria-label={t("feedList.linksLabel", { n: cell.n })} title={t("feedList.linksLabel", { n: cell.n })}>
                        <Link2 size={12} aria-hidden="true" />{cell.n}
                      </span>
                    )}
                    {notes > 0 && (
                      <span className="mfl-cnt" data-cnt="notes" role="img"
                        aria-label={t("feedList.notesLabel", { n: notes })} title={t("feedList.notesLabel", { n: notes })}>
                        <StickyNote size={12} aria-hidden="true" />{notes}
                      </span>
                    )}
                  </span>
                </span>
                <span className="mfl-cnt mfl-cnt-c" data-cnt="comments" data-zero={comments === 0 ? "true" : undefined}
                  role="img" aria-label={commentsLabel} title={commentsLabel}>
                  <MessageCircle size={14} aria-hidden="true" />{comments}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
