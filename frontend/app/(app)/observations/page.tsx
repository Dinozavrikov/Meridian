"use client"
import { usePartialCreateNotice } from "@/lib/use-partial-create-notice"
import { useMutationErrorText } from "@/lib/use-mutation-error-text"
import { Suspense, useState, useMemo } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useEntityUrlSync } from "@/lib/use-entity-url-sync"
import { matchesVisibilityFilter } from "@/lib/entity-filters"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { type PendingLink } from "@/components/entities/entity-link-picker"
import { obsApi, api } from "@/lib/api"
import { useMyLabs } from "@/lib/use-my-labs"
import { renderableHtml } from "@/lib/render-safe-html"
import { useStore } from "@/lib/store"
import { isOwner } from "@/lib/ownership"
import { StatusBadge } from "@/components/ui/status-badge"
import { formatEntityStampFull } from "@/lib/theme"
import { ResizableLayout, useIsMobile } from "@/components/layout/resizable-layout"
import { DetailPanel, DetailPanelEmpty } from "@/components/layout/detail-panel"
import { Header } from "@/components/layout/header"
import { Button } from "@/components/ui/button"
import { Modal } from "@/components/ui/modal"
import { HypothesesTab, PredictionsTab } from "@/components/entities/relations-panel"
import { useT } from "@/lib/i18n/useT"
import { buildTrashConfirmText } from "@/lib/trash-confirm"
import { useTranslatedField, useListContentTranslation } from "@/lib/i18n/useContentT"
import { WorldviewTab } from "@/components/entities/worldview-tab"
import { TasksTab } from "@/components/entities/tasks-tab"
import { EntityConversation } from "@/components/entities/entity-conversation"
import { tag, sectionSearch, sectionSearchWrap, theme } from "@/lib/theme"
import { Eye, Plus, Send, Search } from "lucide-react"
import { useEditor, EditorContent } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Underline from "@tiptap/extension-underline"
import Link from "@tiptap/extension-link"
import Placeholder from "@tiptap/extension-placeholder"
import { PageShell, PageContent, SPLIT_BODY_STYLE } from "@/components/layout/page-shell"
import { EntityListItem } from "@/components/layout/entity-list-item"
import { MiniScale } from "@/components/ui/mini-scale"
import { ContradictionNudge } from "@/components/entities/contradiction-nudge"
import { RichHtml } from "@/components/entities/rich-html"
import { EntityQuickAddMenu } from "@/components/entities/entity-quick-add-menu"
import { VisibilityBadge } from "@/components/entities/visibility-badge"
import { PassportShares, VisibilityControl } from "@/components/entities/passport-shares"
import { VisibilityPicker } from "@/components/entities/visibility-picker"
import { SourcesTab } from "@/components/hypotheses/sources-tab"
import { FilesTab } from "@/components/entities/files-tab"
import { EntityHistoryTab, historyTabs } from "@/components/entities/entity-history-tab"
import { EntityPassport } from "@/components/entities/passport"
import { EntityKnowledge } from "@/components/entities/entity-knowledge"
import { useRelatedGroups } from "@/lib/use-related-groups"
import { resolveEntityTab, relatedTabsFor } from "@/lib/entity-tab"
import { EntityPage } from "@/components/layout/entity-page"
import { ActionButton } from "@/components/ui/action-button"
import { AuthorChip } from "@/components/entities/author-chip"
import { ObservationFactorsButton, ObservationReflectionNudge } from "@/components/entities/observation-reflection"
import { Pencil as PencilIcon } from "lucide-react"
import { ListFilters } from "@/components/entities/list-filters"
import { VisibilityTabs } from "@/components/entities/visibility-tabs"
import { usePagination, PaginationBar } from "@/components/layout/pagination"
import { VisibilityValue } from "@/components/ui/orbit-selector"
import { DEFAULT_SCALES } from "@/lib/scales"
import { apiErrorMessage } from "@/lib/api-error"
const IMPORTANCE_SCALE = DEFAULT_SCALES.find(s => s.id === "importance" && s.entity_type === "observation")!

import { updateEntityWithLinks } from "@/lib/entity-update-with-links"
import { stripHtml as stripHtmlForValidation } from "@/lib/strip-html"
import { ObservationForm } from "@/components/entities/forms/observation-form"
import { createObservationFull } from "@/lib/create-observation"
import { OBSERVATION_STATUSES } from "@/lib/observation-constants"
import { toast } from "@/lib/toast"

const ACCENT = "#1ABC9C"

// ── PublishModal ───────────────────────────────────────────────────────────
function PublishModal({ obs, labs, onClose }: { obs: any; labs: any[]; onClose: () => void }) {
  const t = useT()
  const qc = useQueryClient()
  const [tab, setTab] = useState<"visibility" | "blog">("visibility")
  const [vis, setVis] = useState<string>(obs.visibility ?? "private")
  const [labId, setLabId] = useState<number | null>(obs.lab_id ?? null)
  const [blogTitle, setBlogTitle] = useState(obs.title || "")
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: t("observations.blogPlaceholder") }),
    ],
    content: "",
  })


  const updateVis = useMutation({
    mutationFn: (d: any) => obsApi.update(obs.id, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["observations"] }); qc.invalidateQueries({ queryKey: ["record-shares"] }); onClose() },
  })

  const createPost = useMutation({
    mutationFn: (d: any) => api.post(`/api/v1/feed/observation/${obs.id}/posts`, d).then(r => r.data),
    onSuccess: () => { onClose() },
    onError: (e: any) => { toast({ message: t("errors.requestFailed", { message: apiErrorMessage(e, t("errors.unknown"), t("errors.invalidInput")) }), tone: "error" }) },
  })

  const saveVis = () => updateVis.mutate({
    date: obs.date, author: obs.author, title: obs.title, text: obs.text,
    tags: obs.tags ?? [], visibility: vis, lab_id: vis === "lab" ? labId : null,
  })

  const saveBlog = () => {
    if (!blogTitle.trim()) return
    const comment = editor?.getHTML() ?? ""
    const isEmpty = !comment || comment === "<p></p>"
    const original = obs.text ? `<blockquote>${obs.text}</blockquote>` : ""
    const divider = !isEmpty && original ? `<hr/>` : ""
    const content = (!isEmpty ? comment : "") + divider + original
    if (!content.trim()) return
    createPost.mutate({ title: blogTitle, content })
  }

  const TabBtn = ({ id, label }: { id: "visibility" | "blog"; label: string }) => (
    <button onClick={() => setTab(id)}
      style={{ flex: 1, padding: "8px 0", fontSize: 12, fontWeight: tab === id ? 600 : 400, color: tab === id ? "#e0e0f0" : "#9696a0", background: "transparent", border: "none", borderBottom: `2px solid ${tab === id ? ACCENT : "transparent"}`, cursor: "pointer", transition: "all 0.12s" }}>
      {label}
    </button>
  )

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* вкладки */}
      <div style={{ display: "flex", borderBottom: "1px solid #1a1a28", marginBottom: 20 }}>
        <TabBtn id="visibility" label={t("field.visibility")} />
        <TabBtn id="blog" label={t("observations.blogTab")} />
      </div>

      {tab === "visibility" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <p style={{ fontSize: 12, color: "#9696a1", margin: 0 }}>{t("observations.publishVisIntro")}</p>
          <VisibilityPicker value={vis} onChange={setVis} labId={labId} onLabChange={setLabId} labs={labs} accent={ACCENT} />
          <PassportShares entityType="observation" entityId={obs.id} enabled />
          <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", paddingTop: 12, borderTop: "1px solid #1a1a28" }}>
            <Button variant="ghost" onClick={onClose}>{t("actions.cancel")}</Button>
            <Button variant="primary" onClick={saveVis} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Send size={12} /> {t("actions.save")}
            </Button>
          </div>
        </div>
      )}

      {tab === "blog" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <input value={blogTitle} onChange={e => setBlogTitle(e.target.value)}
            placeholder={t("observations.blogTitlePlaceholder")}
            style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid #1e1e28", background: "#0d0d16", color: "#e0e0f0", fontSize: 14, fontWeight: 600, outline: "none" }} />

          {/* Комментарий автора — rich editor */}
          <div>
            <div style={{ fontSize: 11, color: "#9696a1", marginBottom: 6, letterSpacing: "0.08em", textTransform: "uppercase" }}>{t("observations.blogCommentLabel")}</div>
            <div style={{ display: "flex", gap: 4, padding: "6px 8px", background: "#0d0d16", borderRadius: "8px 8px 0 0", border: "1px solid #1a1a28", borderBottom: "none", flexWrap: "wrap" }}>
              {[
                { label: "B",   action: () => editor?.chain().focus().toggleBold().run(),        active: () => editor?.isActive("bold")        ?? false, style: { fontWeight: 700 } },
                { label: "I",   action: () => editor?.chain().focus().toggleItalic().run(),      active: () => editor?.isActive("italic")      ?? false, style: { fontStyle: "italic" } },
                { label: "U",   action: () => editor?.chain().focus().toggleUnderline().run(),   active: () => editor?.isActive("underline")   ?? false, style: { textDecoration: "underline" } },
                { label: "S",   action: () => editor?.chain().focus().toggleStrike().run(),      active: () => editor?.isActive("strike")      ?? false, style: { textDecoration: "line-through" } },
                { label: "H1",  action: () => editor?.chain().focus().toggleHeading({ level: 1 }).run(), active: () => editor?.isActive("heading", { level: 1 }) ?? false, style: { fontSize: 11 } },
                { label: "H2",  action: () => editor?.chain().focus().toggleHeading({ level: 2 }).run(), active: () => editor?.isActive("heading", { level: 2 }) ?? false, style: { fontSize: 11 } },
                { label: "• ",  action: () => editor?.chain().focus().toggleBulletList().run(),  active: () => editor?.isActive("bulletList")  ?? false, style: {} },
                { label: "1.",  action: () => editor?.chain().focus().toggleOrderedList().run(), active: () => editor?.isActive("orderedList") ?? false, style: {} },
                { label: "❝",  action: () => editor?.chain().focus().toggleBlockquote().run(),  active: () => editor?.isActive("blockquote")  ?? false, style: {} },
              ].map((btn, i) => (
                <button key={i} type="button" onClick={btn.action}
                  style={{ padding: "4px 8px", borderRadius: 5, border: "none", background: btn.active() ? `${ACCENT}20` : "transparent", color: btn.active() ? ACCENT : "#9898a2", cursor: "pointer", fontSize: 12, transition: "all 0.1s", ...btn.style }}>
                  {btn.label}
                </button>
              ))}
            </div>
            <div style={{ minHeight: 120, padding: "12px 14px", background: "#0a0a12", border: "1px solid #1a1a28", borderRadius: "0 0 8px 8px", color: "#c0c0d8", fontSize: 14, lineHeight: 1.8, cursor: "text" }}
              onClick={() => editor?.commands.focus()}>
              <EditorContent editor={editor} />
            </div>
            <style>{`
              .tiptap { outline: none; min-height: 80px; }
              .tiptap p.is-editor-empty:first-child::before { content: attr(data-placeholder); color: #303040; pointer-events: none; float: left; height: 0; }
              .tiptap strong { color: #e8e8f0; }
              .tiptap h1 { font-size: 1.3em; font-weight: 700; color: #e0e0f0; margin: 8px 0 4px; }
              .tiptap h2 { font-size: 1.1em; font-weight: 600; color: #d0d0e8; margin: 6px 0 4px; }
              .tiptap ul, .tiptap ol { padding-left: 20px; }
              .tiptap blockquote { border-left: 3px solid ${ACCENT}; padding-left: 12px; color: #808090; margin: 6px 0; }
            `}</style>
          </div>

          {/* Исходник — readonly */}
          {obs.text && (
            <div>
              <div style={{ fontSize: 11, color: "#96969d", marginBottom: 6, letterSpacing: "0.08em", textTransform: "uppercase", display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 3, height: 12, background: "#303048", borderRadius: 2, display: "inline-block" }} />
                {t("observations.blogSourceLabel")}
              </div>
              <div style={{ padding: "12px 14px", borderRadius: 8, border: "1px solid #1a1a24", background: "#070710", color: "#9696a1", fontSize: 13, lineHeight: 1.7, borderLeft: "3px solid #2a2a40", maxHeight: 180, overflowY: "auto" }}
                dangerouslySetInnerHTML={{ __html: renderableHtml(obs.text) }} />
            </div>
          )}

          <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", paddingTop: 12, borderTop: "1px solid #1a1a28" }}>
            <Button variant="ghost" onClick={onClose}>{t("actions.cancel")}</Button>
            <Button variant="primary" onClick={saveBlog}
              disabled={!blogTitle.trim()}
              style={{ display: "flex", alignItems: "center", gap: 6, opacity: blogTitle.trim() ? 1 : 0.4, cursor: blogTitle.trim() ? "pointer" : "not-allowed" }}>
              <Send size={12} /> {t("actions.publish")}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}


// ── ObsDetail ──────────────────────────────────────────────────────────────
function ObsDetail({ obs, labs, onEdit, onPublish, onTagClick, tab: rawTab, setTab }: { obs: any; labs: any[]; onEdit?: () => void; onPublish: () => void; onTagClick: (t: string) => void; tab: string; setTab: (t: string) => void }) {
  const t = useT()
  const qc = useQueryClient()
  const locale = useStore(s => s.locale)
  const currentUser = useStore(s => s.user)
  const tab = resolveEntityTab(rawTab)
  const { counts } = useRelatedGroups("observation", obs.id)
  // Переиспользуем общий хелпер isOwner из lib/ownership вместо ручного
  // сравнения user_id — во избежание конфликта имени с уже импортированной
  // функцией isOwner(user, entity), используемой ниже для edit/delete.
  const isContradictionCheckOwner = isOwner(currentUser, obs)
  const translatedTitle = useTranslatedField("observation", obs.id, "title", obs.title, isContradictionCheckOwner)
  const translatedText = useTranslatedField("observation", obs.id, "text", obs.text, isContradictionCheckOwner)
  const dateStr = formatEntityStampFull(obs.created_at ?? obs.date, locale) ?? ""
  const updateScale = useMutation({
    mutationFn: (patch: Record<string, number | null>) =>
      obsApi.update(obs.id, { date: obs.date, author: obs.author, title: obs.title, text: obs.text, tags: obs.tags ?? [], status: obs.status, visibility: obs.visibility, lab_id: obs.lab_id, ...patch }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["observations"] }),
  })

  return (
    <>
      <EntityPage
        accent={ACCENT}
        icon={<Eye size={14} />}
        kicker={t("entityType.observation")}
        dateStr={dateStr}
        title={translatedTitle || stripHtmlForValidation(translatedText ?? "").slice(0, 80)}
        tags={obs.tags?.length > 0 ? (
          obs.tags.map((tg: string) => (
            <span key={tg} style={{ ...tag(ACCENT), cursor: "pointer" }} onClick={() => onTagClick(tg)}>{tg}</span>
          ))
        ) : undefined}
        actions={
          <>
            {onEdit && (
              <ActionButton variant="primary" accent={ACCENT} icon={<PencilIcon size={14} />} onClick={onEdit}>
                {t("actions.edit")}
              </ActionButton>
            )}
            {/* Гость не может создавать/привязывать связанные записи — меню всё равно упрётся в 401/403. */}
            {currentUser && <EntityQuickAddMenu entityType="observation" entityId={obs.id} entityName={obs.title} />}
            {isContradictionCheckOwner && <ObservationFactorsButton observationId={obs.id} />}
          </>
        }
        insights={
          <>
            <ContradictionNudge entityType="observation" entityId={obs.id} text={stripHtmlForValidation(obs.text ?? "")} accent={ACCENT} isOwner={isContradictionCheckOwner} />
            {isContradictionCheckOwner && <ObservationReflectionNudge observationId={obs.id} />}
          </>
        }
        passport={compact => (
          <EntityPassport
            entityType="observation"
            entityId={obs.id}
            values={obs}
            onSave={patch => updateScale.mutate(patch)}
            isPending={updateScale.isPending}
            isOwner={isContradictionCheckOwner}
            accent={ACCENT}
            compact={compact}
            meta={[
              { label: t("passport.status"), node: <StatusBadge status={obs.status} fontSize={12} /> },
              { label: t("passport.visibility"), node: <VisibilityControl visibility={obs.visibility} labColor={ACCENT} entityType="observation" entityId={obs.id} isOwner={isContradictionCheckOwner} onOpen={onPublish} /> },
              ...((obs.author || obs.owner_display_name) ? [{ label: t("passport.author"), node: <AuthorChip name={obs.author || obs.owner_display_name} username={obs.owner_username} /> }] : []),
            ]}
          />
        )}
        tabs={[
          { id: "detail",       label: t("tabs.detail")    },
          { id: "hypotheses",   label: t("tabs.hypotheses"), count: counts.hypothesis },
          { id: "predictions",  label: t("tabs.predictions"), count: counts.prediction },
          { id: "worldview",    label: t("tabs.worldview"), count: counts.worldview },
          { id: "tasks",        label: t("tabs.tasks"), count: counts.task    },
          { id: "sources",      label: t("tabs.sources") },
          { id: "images",       label: t("tabs.files") },
          ...historyTabs(t, isContradictionCheckOwner),
        ]}
        activeTab={tab}
        onTabChange={id => setTab(id)}
        scrollKey={obs.id}
      >
        {tab === "detail" && (
          <>
            {obs.title && obs.text && (
              <>
                <RichHtml html={renderableHtml(translatedText)} accent={ACCENT} className="obs-body-html"
                style={{ fontSize: 16, color: "#d4d2cd", lineHeight: 1.75, margin: "0 0 28px", maxWidth: 760, fontWeight: 400 }} />
              </>
            )}
            <div style={{ margin: "0 0 28px" }}>
              <EntityKnowledge
                entityType="observation" entityId={obs.id} entityTitle={obs.title} accent={ACCENT}
                addAction={currentUser ? <EntityQuickAddMenu entityType="observation" entityId={obs.id} entityName={obs.title} /> : undefined}
                tabForType={relatedTabsFor("observation")}
                onOpenTab={setTab}
              />
            </div>
            <div style={{ borderTop: "1px solid #262b42", paddingTop: 20, marginTop: 4 }}>
              <EntityConversation entityType="observation" entity={obs} accent={ACCENT} />
            </div>
          </>
        )}
        {tab === "hypotheses" && (
          <HypothesesTab entityType="observation" entityId={obs.id} entityName={obs.title} />
        )}
        {tab === "predictions" && (
          <PredictionsTab entityType="observation" entityId={obs.id} entityName={obs.title} />
        )}
        {tab === "worldview" && (
          <WorldviewTab entityType="observation" entityId={obs.id} entityName={obs.title} />
        )}
        {tab === "tasks" && (
          <TasksTab entityType="observation" entityId={obs.id} entityName={obs.title} />
        )}
        {tab === "sources" && (
          <SourcesTab entityType="observation" entityId={obs.id} entityName={obs.title} canEdit={isContradictionCheckOwner} />
        )}
        {tab === "history" && <EntityHistoryTab entityType="observation" entityId={obs.id} isOwner={isContradictionCheckOwner} />}
        {tab === "images" && (
          <FilesTab entityType="observation" entityId={obs.id} isOwner={isContradictionCheckOwner} />
        )}
      </EntityPage>
    </>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────
function ObservationsPageInner() {
  const t = useT()
  const user = useStore(s => s.user)
  const qc = useQueryClient()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { data = [], isLoading } = useQuery({ queryKey: ["observations"], queryFn: () => obsApi.list() })
  const { data: labs = [] } = useMyLabs()
  const [modal, setModal] = useState<null | "create" | any>(null)
  const [publishObs, setPublishObs] = useState<any>(null)
  const [selected, setSelected] = useState<any>(null)
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<Record<string, boolean>>({})
  // Гость по умолчанию видит "Публичное" — вкладка "Личное" для него
  // и вовсе скрыта (см. VisibilityTabs isGuest), дефолт "private" был бы
  // тупиком: пустой список без объяснения, почему он пуст.
  const [activeVisibility, setActiveVisibility] = useState<VisibilityValue>(user ? "private" : "public")
  const [activeLabId, setActiveLabId] = useState<number | null>(null)
  const [tab, setTab] = useState<"detail" | "hypotheses" | "predictions" | "worldview" | "tasks" | "relations" | "sources" | "images">(
    (searchParams.get("tab") as any) ?? "detail"
  )

  const changeTab = (t: string) => {
    setTab(t as any)
    const p = new URLSearchParams(searchParams.toString())
    p.set("tab", t)
    router.replace(`?${p.toString()}`, { scroll: false })
  }

  const isMobile = useIsMobile()
  const { selectEntity, clearSelection } = useEntityUrlSync(data as any[], selected, setSelected, (idOrSlug) => obsApi.get(idOrSlug), isMobile, () => filtered)
  const selectObs = (o: any) => {
    setTab("detail")
    selectEntity(o)
  }

  const errorText = useMutationErrorText()
  const notifyPartial = usePartialCreateNotice()
  const create = useMutation({
    mutationFn: createObservationFull,
    onSuccess: (created: any) => {
      notifyPartial(created)
      qc.invalidateQueries({ queryKey: ["observations"] })
      qc.invalidateQueries({ queryKey: ["related"] })
      setModal(null)
    },
  })
  const update = useMutation({
    // Симметрично create: ObservationForm собирает links/images и в режиме
    // редактирования — раньше здесь принимался только { id, d } и всё
    // выбранное молча терялось (баг найден при аудите Этап 8, 18.08).
    // Общий хелпер вместо своей копии кода — тот же, что у predictions/hypotheses.
    // ObservationForm отдаёт links/images отдельными полями объекта onSave
    // (не упаковывает в data, в отличие от HypForm).
    mutationFn: ({ id, d, links, images }: { id: number; d: any; links?: PendingLink[]; images?: File[] }) =>
      updateEntityWithLinks("observation", id, obsApi.update, d, links, images),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["observations"] })
      qc.invalidateQueries({ queryKey: ["related"] })
      setModal(null)
    },
  })
  const remove = useMutation({ mutationFn: obsApi.delete, onSuccess: () => { qc.invalidateQueries({ queryKey: ["observations"] }); setSelected(null) } })

  const activeStatuses = Object.keys(statusFilter).filter(k => statusFilter[k])
  const preVisibility = useMemo(() => {
    let res = data as any[]
    if (activeTag) res = res.filter(o => o.tags?.includes(activeTag))
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      res = res.filter(o =>
        o.title?.toLowerCase().includes(q) ||
        stripHtmlForValidation(o.text ?? "").toLowerCase().includes(q) ||
        o.tags?.some((t: string) => t.toLowerCase().includes(q))
      )
    }
    if (activeStatuses.length > 0) res = res.filter(o => activeStatuses.includes(o.status))
    return res
  }, [data, activeTag, search, statusFilter])
  const visibilityCounts = {
    private: preVisibility.filter(o => matchesVisibilityFilter(o, ["private"])).length,
    lab: preVisibility.filter(o => matchesVisibilityFilter(o, ["lab"])).length,
    public: preVisibility.filter(o => matchesVisibilityFilter(o, ["public"])).length,
  }
  const filtered = useMemo(() => {
    let res = preVisibility.filter(o => matchesVisibilityFilter(o, [activeVisibility]))
    if (activeLabId) res = res.filter(o => o.lab_id === activeLabId)
    return res
  }, [preVisibility, activeVisibility, activeLabId])

  const toggleTag = (t: string) => setActiveTag(p => p === t ? null : t)
  const { page, setPage, pageCount, paged, pageSize } = usePagination(filtered)
  const listTr = useListContentTranslation("observation", paged, ["title", "text"], (o: any) => isOwner(user, o))

  // Синхронизируем selected после обновления данных
  const selectedFresh = useMemo(() =>
    selected ? (data as any[]).find((o: any) => o.id === selected.id) ?? selected : null
  , [data, selected])

  return (
    <PageShell>
      <Header titleKey="page.observations.title" color="#2ECC71" icon={<Eye size={16} style={{ color: "#2ECC71" }} />} actions={
        // Гость не может создавать записи — не показываем кнопку, которая
        // всё равно упрётся в 401/403 при попытке сохранить.
        user ? (
          <Button variant="primary" size="sm" onClick={() => setModal("create")}
            style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Plus size={13} /> {t("actions.createObservationAction")}
          </Button>
        ) : undefined
      } />

      <PageContent overflow="visible" noPadding>
        <div style={SPLIT_BODY_STYLE}>
        {isLoading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {[...Array(5)].map((_, i) => <div key={i} style={{ height: 72, borderRadius: 10, background: "#111", border: "1px solid #1a1a1a", opacity: 0.5 - i * 0.08 }} />)}
          </div>
        ) : (data as any[]).length === 0 ? (
          <div style={{ textAlign: "center", padding: "80px 0" }}>
            <Eye size={36} style={{ color: "#979797", margin: "0 auto 12px", display: "block" }} />
            <p style={{ fontSize: 14, color: "#969696" }}>{t("observations.emptyTitle")}</p>
            <p style={{ fontSize: 12, color: "#9b9b9b", marginTop: 4 }}>{t("observations.emptySubtitle")}</p>
          </div>
        ) : (
            <ResizableLayout
              accent="#2ECC71"
              backLabel={t("observations.backLabel")}
              showRight={!!selectedFresh}
              onBack={() => setSelected(null)}
              left={<div style={{ background: theme.bg1, overflow: "hidden", display: "flex", flexDirection: "column", height: "100%", flex: 1 }}>
              {activeTag && (
                <div style={{ padding: "8px 14px", borderBottom: "1px solid #111", display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 11, color: "#96969e" }}>{t("observations.tagLabel")}</span>
                  <span style={{ ...tag(ACCENT), cursor: "pointer" }} onClick={() => setActiveTag(null)}>
                    {activeTag} ×
                  </span>
                </div>
              )}
              <PaginationBar total={filtered.length} page={page} pageSize={pageSize} pageCount={pageCount} onPageChange={setPage} />
              <div style={sectionSearchWrap()}>
                <Search size={13} style={{ position: "absolute", left: 22, top: "50%", transform: "translateY(-50%)", color: "#848cb0", pointerEvents: "none" }} />
                <input
                  value={search}
                  onChange={e => { setSearch(e.target.value); setPage(0) }}
                  placeholder={t("observations.searchPlaceholder")}
                  style={sectionSearch("#2ECC71")}
                  onFocus={e => (e.target as HTMLElement).style.borderColor = "#2ECC7140"}
                  onBlur={e => (e.target as HTMLElement).style.borderColor = "#1e1e2a"}
                />
              </div>
              <VisibilityTabs
                active={activeVisibility}
                onChange={v => { setActiveVisibility(v); setPage(0); clearSelection() }}
                counts={visibilityCounts}
                labs={labs}
                activeLabId={activeLabId}
                onLabChange={id => { setActiveLabId(id); setPage(0) }}
                isGuest={!user}
              />
              <ListFilters
                statuses={OBSERVATION_STATUSES}
                activeStatuses={statusFilter}
                onToggleStatus={s => { setStatusFilter(p => ({ ...p, [s]: !p[s] })); setPage(0) }}
                accent={ACCENT}
                showVisibility={false}
              />
              <div style={{ overflowY: "auto", flex: 1, minHeight: 0 }}>
                {paged.map((o: any) => {
                  const isActive = selectedFresh?.id === o.id
                  return (
                    <EntityListItem
                      key={o.id}
                      id={o.id}
                      isActive={isActive}
                      accent={ACCENT}
                      onClick={() => selectObs(o)}
                      date={o.created_at}
                      title={listTr(o, "title", o.title) || stripHtmlForValidation(listTr(o, "text", o.text) ?? "").slice(0, 80)}
                      fullText={o.title && o.text ? stripHtmlForValidation(listTr(o, "text", o.text) ?? "") : undefined}
                      status={o.status}
                      tags={o.tags}
                      activeTag={activeTag}
                      onTagClick={toggleTag}
                      onEdit={isOwner(user, o) ? () => setModal(o) : undefined}
                      onDelete={isOwner(user, o) ? () => remove.mutate(o.id) : undefined}
                      progressBar={o.importance != null ? <MiniScale name={t("observations.importanceHeading")} value={o.importance} min={0} max={5} levels={IMPORTANCE_SCALE.levels} color={ACCENT} /> : undefined}
                      showPreview={false}
                      deleteConfirmText={buildTrashConfirmText(t, "observation", o)}
                    />
                  )
                })}
              </div>
            </div>}
              right={selectedFresh
                ? (
                  <DetailPanel accent={ACCENT}>
                    <ObsDetail
                      obs={selectedFresh}
                      labs={labs}
                      onEdit={isOwner(user, selectedFresh) ? () => setModal(selectedFresh) : undefined}
                      onPublish={() => setPublishObs(selectedFresh)}
                      onTagClick={toggleTag}
                      tab={tab}
                      setTab={changeTab}
                    />
                  </DetailPanel>
                )
                : (
                  <DetailPanelEmpty accent={ACCENT} />
                )
              }
            />
        )}
        </div>
      </PageContent>

      <Modal open={!!modal} onClose={() => { setModal(null); create.reset(); update.reset() }}
        title={modal === "create" ? t("observations.createTitle") : t("observations.editTitle")} size="md">
        <ObservationForm initial={modal !== "create" ? modal : undefined}
          onSave={({ data, links, images, pendingFiles }) => modal === "create"
            ? create.mutate({ data, links, images, pendingFiles })
            : update.mutate({ id: modal.id, d: data, links, images })}
          onCancel={() => { setModal(null); create.reset(); update.reset() }} labs={labs}
          submitting={create.isPending || update.isPending}
          error={errorText(modal === "create" ? create.error : update.error)} />
      </Modal>

      <Modal open={!!publishObs} onClose={() => setPublishObs(null)} title={t("observations.publishTitle")} size="xl">
        {publishObs && <PublishModal obs={publishObs} labs={labs} onClose={() => setPublishObs(null)} />}
      </Modal>
    </PageShell>
  )
}

export default function ObservationsPage() {
  return (
    <Suspense>
      <ObservationsPageInner />
    </Suspense>
  )
}
