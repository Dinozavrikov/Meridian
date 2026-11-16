"use client"
import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from "react"
import { useQuery } from "@tanstack/react-query"
import { FlaskConical, Globe, Lock, MessageCircle, StickyNote } from "lucide-react"
import { discussionApi } from "@/lib/api"
import { useStore } from "@/lib/store"
import { useT } from "@/lib/i18n/useT"
import { theme, v2, ink } from "@/lib/theme"
import { splitPersonalNotes } from "@/lib/discussion-notes"
import { isOwner as isOwnerOf } from "@/lib/ownership"
import { NotesTimeline } from "@/components/ui/notes-timeline"
import { DiscussionPanel } from "@/components/discussion/discussion-panel"

type Tab = "notes" | "discussion"

const count = (xs: any[]): number => xs.reduce((n, c) => n + 1 + count(c.replies ?? []), 0)
const countNew = (xs: any[]): number => xs.reduce((n, c) => n + (c.is_new ? 1 : 0) + countNew(c.replies ?? []), 0)

const CSS = `
.ec-bar{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px 16px;margin-bottom:18px}
.ec-seg{position:relative;display:inline-grid;grid-template-columns:1fr 1fr;padding:3px;border-radius:12px;background:${v2.surf2};border:1px solid ${v2.bd}}
.ec-thumb{position:absolute;top:3px;bottom:3px;left:3px;width:calc(50% - 3px);border-radius:9px;background:var(--ec-soft);border:1px solid var(--ec-line);box-shadow:0 4px 14px -8px var(--ec);transition:transform .28s cubic-bezier(.3,.9,.3,1)}
.ec-seg[data-i="1"] .ec-thumb{transform:translateX(100%)}
.ec-tab{position:relative;z-index:1;display:flex;align-items:center;justify-content:center;gap:7px;min-width:132px;padding:8px 16px;border:none;border-radius:9px;background:transparent;color:${ink.label};font:600 13px inherit;cursor:pointer;transition:color .2s}
.ec-tab:hover{color:${v2.t2}}
.ec-tab[aria-selected="true"]{color:var(--ec)}
.ec-tab:focus-visible{outline:2px solid var(--ec);outline-offset:1px}
.ec-n{font:600 10.5px ${theme.mono};padding:1px 6px;border-radius:6px;background:${v2.bd};color:${ink.muted};transition:background .2s,color .2s}
.ec-tab[aria-selected="true"] .ec-n{background:var(--ec-soft);color:var(--ec)}
.ec-dot{width:7px;height:7px;border-radius:50%;background:var(--ec);box-shadow:0 0 0 3px var(--ec-soft)}
.ec-hint{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:${ink.muted}}
.ec-panel{animation:ec-in .22s ease}
@keyframes ec-in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
@media (max-width:560px){.ec-bar{flex-direction:column;align-items:stretch}.ec-seg{width:100%}.ec-tab{min-width:0}.ec-hint{justify-content:center}}
@media (prefers-reduced-motion:reduce){.ec-thumb,.ec-tab,.ec-n{transition:none}.ec-panel{animation:none}}
`

/** Заметки и обсуждение записи.
 *  Приватная запись — только заметки (как раньше). Публичная/лабораторная: не владельцу — только обсуждение
 *  (личных заметок у него нет); владельцу — переключатель «Заметки | Обсуждение»: заметки видны только ему, обсуждение
 *  всем, кому открыта запись. Оба счётчика считаются из одного запроса комментариев. */
export function EntityConversation({ entityType, entity, accent = theme.accent }: {
  entityType: string; entity: any; accent?: string
}) {
  const t = useT()
  const user = useStore(s => s.user)
  const entityId: number = entity.id
  const access: string | null | undefined = entity.access
  const visibility: string | null | undefined = entity.visibility
  const isOwner = isOwnerOf(user, entity)
  const inLab = !!entity.lab_id
  const uid = useId()
  const shared = visibility === "public" || visibility === "lab"
  const split = shared && isOwner
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const [choice, setChoice] = useState<Tab | null>(null)
  const [visited, setVisited] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ["comments", entityType, entityId],
    queryFn: () => discussionApi.comments(entityType, entityId),
    enabled: !!entityId && split,
  })
  const { discussion, personal } = splitPersonalNotes<any>(data ?? [], user?.username)
  const nNotes = count(personal), nDisc = count(discussion), newDisc = countNew(discussion)
  const key = `${entityType}:${entityId}`
  const [init, setInit] = useState<{ key: string; tab: Tab } | null>(null)
  if (!isLoading && data && init?.key !== key) {   // стартовая вкладка — один раз на запись: новый комментарий не переключает её из-под рук
    setInit({ key, tab: newDisc > 0 ? "discussion" : nNotes > 0 ? "notes" : nDisc > 0 ? "discussion" : "notes" })
  }
  const tab: Tab = choice ?? (init?.key === key ? init.tab : "notes")

  useEffect(() => { setChoice(null); setVisited(false) }, [key])   // другая запись на том же месте — всё заново
  useEffect(() => { if (tab === "discussion") setVisited(true) }, [tab])

  if (!shared) {
    return <NotesTimeline entityType={entityType} entityId={entityId} accent={accent} access={access} inLab={inLab} />
  }
  if (!isOwner) {
    return <DiscussionPanel type={entityType} entityId={entityId} readOnly={access === "opened"} inLab={inLab} />
  }
  if (isLoading) {
    return <div aria-hidden style={{ height: 44, borderRadius: 12, background: v2.surf2, opacity: 0.6 }} />
  }

  const select = (to: Tab) => setChoice(to)
  const onKey = (e: KeyboardEvent) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return
    e.preventDefault()
    const to: Tab = e.key === "ArrowLeft" || e.key === "Home" ? "notes" : "discussion"
    select(to)
    refs.current[to === "notes" ? 0 : 1]?.focus()
  }
  const showDot = tab === "notes" && newDisc > 0 && !visited
  const HintIcon = tab === "notes" ? Lock : visibility === "lab" ? FlaskConical : Globe
  const hint = tab === "notes" ? t("conv.hintNotes") : visibility === "lab" ? t("conv.hintDiscussionLab") : t("conv.hintDiscussionPublic")
  const vars = { ["--ec" as string]: accent, ["--ec-soft" as string]: accent + "14", ["--ec-line" as string]: accent + "3a" } as CSSProperties

  return (
    <section style={vars} data-testid="entity-conversation">
      <style>{CSS}</style>
      <div className="ec-bar">
        <div role="tablist" aria-label={t("conv.tabsAria")} className="ec-seg" data-i={tab === "notes" ? 0 : 1}
          data-testid="conv-tablist" onKeyDown={onKey}>
          <i className="ec-thumb" aria-hidden />
          <button type="button" role="tab" id={`${uid}-notes`} aria-selected={tab === "notes"} aria-controls={`${uid}-panel`}
            tabIndex={tab === "notes" ? 0 : -1} className="ec-tab" data-testid="conv-tab-notes"
            ref={el => { refs.current[0] = el }} onClick={() => select("notes")}>
            <StickyNote size={14} aria-hidden /> {t("conv.tabNotes")} <span className="ec-n">{nNotes}</span>
            {showDot && <i className="ec-dot" data-testid="conv-dot" role="img" aria-label={t("conv.newDot")} />}
          </button>
          <button type="button" role="tab" id={`${uid}-discussion`} aria-selected={tab === "discussion"} aria-controls={`${uid}-panel`}
            tabIndex={tab === "discussion" ? 0 : -1} className="ec-tab" data-testid="conv-tab-discussion"
            ref={el => { refs.current[1] = el }} onClick={() => select("discussion")}>
            <MessageCircle size={14} aria-hidden /> {t("conv.tabDiscussion")} <span className="ec-n">{nDisc}</span>
          </button>
        </div>
        <span className="ec-hint" data-testid="conv-hint"><HintIcon size={13} aria-hidden />{hint}</span>
      </div>
      <div role="tabpanel" id={`${uid}-panel`} aria-labelledby={`${uid}-${tab}`} className="ec-panel" key={tab}>
        {tab === "notes" ? (
          <NotesTimeline entityType={entityType} entityId={entityId} accent={accent} access={access}
            personalOnly trackSeen={false} bare inLab={false} />
        ) : (
          <DiscussionPanel type={entityType} entityId={entityId} ownerUsername={user?.username} readOnly={access === "opened"} inLab={inLab} />
        )}
      </div>
    </section>
  )
}
