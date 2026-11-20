"use client"
import { Suspense } from "react"
import { useState, useEffect, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useEntityUrlSync } from "@/lib/use-entity-url-sync"
import { matchesVisibilityFilter } from "@/lib/entity-filters"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { EntityLinkPicker, createLinksFor, type PendingLink } from "@/components/entities/entity-link-picker"
import { LocalImagePicker, uploadImagesFor } from "@/components/entities/images-tab"
import { RichTextEditor } from "@/components/entities/rich-text-editor"
import { updateEntityWithLinks } from "@/lib/entity-update-with-links"
import { renderableHtml } from "@/lib/render-safe-html"
import { RichHtml } from "@/components/entities/rich-html"
import { useDynamicTranslate } from "@/lib/i18n/useDynamicT"
import { questionApi, imageApi, resolveMediaUrl } from "@/lib/api"
import { useMyLabs } from "@/lib/use-my-labs"
import { Header } from "@/components/layout/header"
import { Button } from "@/components/ui/button"
import { Modal } from "@/components/ui/modal"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { VisibilitySelect } from "@/components/ui/visibility-select"
import { PageShell, PageContent, SPLIT_BODY_STYLE } from "@/components/layout/page-shell"
import { ResizableLayout, useIsMobile } from "@/components/layout/resizable-layout"
import { DetailPanel, DetailPanelEmpty } from "@/components/layout/detail-panel"
import { EntityPage } from "@/components/layout/entity-page"
import { ActionButton } from "@/components/ui/action-button"
import { AuthorChip } from "@/components/entities/author-chip"
import { EntityPassport } from "@/components/entities/passport"
import { EntityKnowledge } from "@/components/entities/entity-knowledge"
import { useRelatedGroups } from "@/lib/use-related-groups"
import { resolveEntityTab, relatedTabsFor } from "@/lib/entity-tab"
import { EntityQuickAddMenu } from "@/components/entities/entity-quick-add-menu"
import { QuestionAnswerNudge } from "@/components/entities/question-answer-nudge"
import { getVisibilityOptions } from "@/lib/visibility-levels"
import { ObservationsTab, PredictionsTab } from "@/components/entities/relations-panel"
import { WorldviewTab } from "@/components/entities/worldview-tab"
import { TasksTab } from "@/components/entities/tasks-tab"
import { SourcesTab } from "@/components/hypotheses/sources-tab"
import { FilesTab } from "@/components/entities/files-tab"
import { EntityHistoryTab, historyTabs } from "@/components/entities/entity-history-tab"
import { EntityConversation } from "@/components/entities/entity-conversation"
import { ListFilters } from "@/components/entities/list-filters"
import { VisibilityTabs } from "@/components/entities/visibility-tabs"
import { DateStamp } from "@/components/ui/date-stamp"
import { StatusBadge } from "@/components/ui/status-badge"
import { formatEntityStampFull } from "@/lib/theme"
import { useStore } from "@/lib/store"
import { isOwner } from "@/lib/ownership"
import { useT } from "@/lib/i18n/useT"
import { buildTrashConfirmText } from "@/lib/trash-confirm"
import { useTranslatedField, useListContentTranslation } from "@/lib/i18n/useContentT"
import { EntityListItem } from "@/components/layout/entity-list-item"
import { MiniScale } from "@/components/ui/mini-scale"
import { useQuestionAnswerPending } from "@/lib/use-question-answers"
import { QuestionAnswerBadge } from "@/components/ui/question-answer-badge"
import { usePagination, PaginationBar } from "@/components/layout/pagination"
import { EditDeleteActions } from "@/components/layout/entity-row-actions"
import { VisibilityValue } from "@/components/ui/orbit-selector"
import { statusBadge, tag, typeColor, sectionSearch, sectionSearchWrap, theme } from "@/lib/theme"
import { Ruler } from "@/components/ui/ruler"
import { DEFAULT_SCALES } from "@/lib/scales"
const IMPORTANCE_SCALE = DEFAULT_SCALES.find(s => s.id === "importance" && s.entity_type === "question")!

import { Plus, HelpCircle, Search, Pencil } from "lucide-react"
import { format } from "date-fns"

const ACCENT = typeColor.question
export const STATUSES = ["открыт", "исследуется", "отвечен", "отложен", "отклонён"]
export const PRIORITIES = ["низкий", "средний", "высокий", "критический"]
const PCOLOR: Record<string, string> = { "низкий": "#555", "средний": "#4A90D9", "высокий": "#F5A623", "критический": "#E74C3C" }

// ── Form ─────────────────────────────────────────────────────────────────
function QForm({ initial, labs, onSave, onCancel }: any) {
  const t = useT()
  const dtStatus = useDynamicTranslate(STATUSES, { noYo: true })
  const dtPriority = useDynamicTranslate(PRIORITIES, { noYo: true })
  const [form, setForm] = useState({
    title: initial?.title ?? "", text: initial?.text ?? "",
    status: initial?.status ?? "открыт", priority: initial?.priority ?? "средний",
    importance: initial?.importance ?? null,  // null = «не оценено»
    answer: initial?.answer ?? "",
    date_created: initial?.date_created ?? format(new Date(), "yyyy-MM-dd"),
    tags: (initial?.tags ?? []).join(", "),
    visibility: initial?.visibility || "private", lab_id: initial?.lab_id ?? null,
  })
  const [links, setLinks] = useState<PendingLink[]>([])
  const [images, setImages] = useState<File[]>([])
  // Картинки, вставленные ПРЯМО В ТЕКСТ (Описание/Ответ) через RichTextEditor
  // — общий Map для обоих полей: ключ (blob-url) уникален независимо от
  // того, в какое поле картинку вставили, резолвим оба поля одним проходом
  // после появления id (см. create).
  const pendingFilesRef = useRef<Map<string, File>>(new Map())
  const f = (k: string) => (e: any) => setForm(p => ({ ...p, [k]: e.target.value }))
  return (
    <form onSubmit={e => { e.preventDefault(); onSave({ ...form, tags: form.tags.split(",").map((t: string) => t.trim()).filter(Boolean), lab_id: form.lab_id, _links: links, _images: images, _pendingFiles: pendingFilesRef.current }) }}
      style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Input label={t("quickAddQuestion.questionLabel")} placeholder={t("quickAddQuestion.questionPlaceholder")} value={form.title} onChange={f("title")} required />
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label style={{ fontSize: 12, color: "#9696a1" }}>{t("scalesPage.description")}</label>
        <RichTextEditor value={form.text} onChange={html => setForm(p => ({ ...p, text: html }))}
          entityType="question" entityId={initial?.id ?? null} placeholder={t("quickAddQuestion.descriptionPlaceholder")}
          onPendingFileAdded={(url, file) => pendingFilesRef.current.set(url, file)} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        <Select label={t("quickAddQuestion.statusLabel")} value={form.status} onChange={f("status")} options={STATUSES.map(s => ({ value: s, label: dtStatus(s) }))} />
        <Select label={t("quickAddQuestion.priorityLabel")} value={form.priority} onChange={f("priority")} options={PRIORITIES.map(s => ({ value: s, label: dtPriority(s) }))} />
        <Input label={t("hypotheses.dateLabel")} type="date" value={form.date_created} onChange={f("date_created")} />
      </div>
      <div>
        <div style={{ fontSize: 11, color: "#909090", fontWeight: 500, marginBottom: 8 }}>{t("questions.importanceLabel")}</div>
        <Ruler name={t("questions.importanceLabel")} value={form.importance} min={0} max={5} levels={IMPORTANCE_SCALE.levels} color={ACCENT} onChange={v => setForm(p => ({ ...p, importance: v }))} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label style={{ fontSize: 12, color: "#9696a1" }}>{t("questions.answerLabel")}</label>
        <RichTextEditor value={form.answer} onChange={html => setForm(p => ({ ...p, answer: html }))}
          entityType="question" entityId={initial?.id ?? null} placeholder={t("questions.answerPlaceholder")}
          onPendingFileAdded={(url, file) => pendingFilesRef.current.set(url, file)} />
      </div>
      <Input label={t("hypotheses.tagsLabel")} placeholder={t("hypotheses.tagsPlaceholder")} value={form.tags} onChange={f("tags")} />
      <VisibilitySelect
        value={form.visibility}
        onChange={v => setForm(p => ({ ...p, visibility: v }))}
        labId={form.lab_id}
        onLabChange={id => setForm(p => ({ ...p, lab_id: id }))}
        labs={labs}
        accent={ACCENT}
      />
      <EntityLinkPicker value={links} onChange={setLinks} excludeType="question" excludeId={initial?.id} />
      <LocalImagePicker value={images} onChange={setImages} />
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Button type="button" variant="ghost" onClick={onCancel}>{t("actions.cancel")}</Button>
        <Button type="submit" variant="primary">{t("actions.save")}</Button>
      </div>
    </form>
  )
}

// ── Detail ───────────────────────────────────────────────────────────────
export function QDetail({ q, onEdit, tab: rawTab, setTab, extraTabs, renderExtraTab, hypothesesTab }: {
  q: any; onEdit?: () => void; tab: string; setTab: (t: string) => void
  extraTabs?: import("@/components/layout/entity-header").EntityTab[]
  renderExtraTab?: (tabId: string) => React.ReactNode
  hypothesesTab?: import("@/components/layout/entity-header").EntityTab
}) {
  const t = useT()
  const user = useStore(s => s.user)
  const locale = useStore(s => s.locale)
  const qc = useQueryClient()
  const tab = resolveEntityTab(rawTab)
  const owner = isOwner(user, q)
  const { counts } = useRelatedGroups("question", q.id)
  const translatedTitle = useTranslatedField("question", q.id, "title", q.title, owner)
  const translatedText = useTranslatedField("question", q.id, "text", q.text, owner)
  const translatedAnswer = useTranslatedField("question", q.id, "answer", q.answer, owner)
  const dtPriority = useDynamicTranslate(PRIORITIES, { noYo: true })
  const dateStr = formatEntityStampFull(q.created_at ?? q.date_created, locale) ?? ""
  const updateScale = useMutation({
    mutationFn: (patch: Record<string, number | null>) => questionApi.update(q.id, { ...q, tags: q.tags ?? [], ...patch }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["questions"] }),
  })

  return (
    <EntityPage
      accent={ACCENT}
      icon={<HelpCircle size={14} />}
      kicker={t("questions.kicker")}
      dateStr={dateStr}
      title={translatedTitle}
      tags={q.tags?.length > 0 ? q.tags.map((tg: string) => <span key={tg} style={tag(ACCENT)}>{tg}</span>) : undefined}
      actions={
        <>
          {onEdit && (
            <ActionButton variant="primary" accent={ACCENT} icon={<Pencil size={14} />} onClick={onEdit}>
              {t("actions.edit")}
            </ActionButton>
          )}
          {user && <EntityQuickAddMenu entityType="question" entityId={q.id} entityName={q.title} />}
        </>
      }
      insights={<QuestionAnswerNudge questionId={q.id} accent={ACCENT} isOwner={owner} />}
      passport={compact => (
        <EntityPassport
          entityType="question"
          entityId={q.id}
          values={q}
          onSave={patch => updateScale.mutate(patch)}
          isPending={updateScale.isPending}
          isOwner={owner}
          accent={ACCENT}
          compact={compact}
          meta={[
            { label: t("passport.status"), node: <StatusBadge status={q.status} fontSize={12} /> },
            {
              label: t("quickAddQuestion.priorityLabel"),
              node: (
                <span style={{
                  fontSize: 11, padding: "3px 8px", borderRadius: 5,
                  background: `${PCOLOR[q.priority] ?? ACCENT}18`,
                  color: PCOLOR[q.priority] ?? ACCENT,
                  border: `1px solid ${(PCOLOR[q.priority] ?? ACCENT)}33`,
                  fontWeight: 600,
                }}>
                  {dtPriority(q.priority)}
                </span>
              ),
            },
            ...((q.owner_display_name || q.owner_username) ? [{
              label: t("passport.author"),
              node: <AuthorChip name={q.owner_display_name || q.owner_username} username={q.owner_username} />,
            }] : []),
          ]}
        />
      )}
      tabs={[
        { id: "detail", label: t("tabs.detail") },
        ...(hypothesesTab ? [hypothesesTab] : []),
        { id: "observations", label: t("tabs.observations"), count: counts.observation },
        { id: "predictions", label: t("tabs.predictions"), count: counts.prediction },
        { id: "worldview", label: t("tabs.worldview"), count: counts.worldview },
        { id: "tasks", label: t("tabs.tasks"), count: counts.task },
        { id: "sources", label: t("tabs.sources") },
        { id: "images", label: t("tabs.files") },
        ...historyTabs(t, owner),
        ...(extraTabs ?? []),
      ]}
      activeTab={tab}
      onTabChange={setTab}
      scrollKey={q.id}
    >
      {tab === "detail" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 24, minWidth: 0 }}>
          {q.text && (
            <RichHtml html={renderableHtml(translatedText)} accent={ACCENT}
              style={{ fontSize: 16, color: "#d4d2cd", lineHeight: 1.75, maxWidth: 760, overflowWrap: "anywhere" }} />
          )}
          {q.answer && (
            <div style={{
              padding: 16, borderRadius: 12, maxWidth: 760,
              background: "#0e1120", border: "1px solid #262b42",
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#69d7c1", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>
                {t("questions.answerLabel")}
              </div>
              <RichHtml html={renderableHtml(translatedAnswer)} accent={ACCENT}
              style={{ fontSize: 16, color: "#d4d2cd", lineHeight: 1.75, maxWidth: 760, overflowWrap: "anywhere" }} />
            </div>
          )}
          <EntityKnowledge
            entityType="question"
            entityId={q.id}
            entityTitle={translatedTitle}
            accent={ACCENT}
            addAction={user ? <EntityQuickAddMenu entityType="question" entityId={q.id} entityName={q.title} /> : undefined}
            tabForType={relatedTabsFor("question")}
            onOpenTab={setTab}
          />
          <div style={{ borderTop: "1px solid #262b42", paddingTop: 24, minWidth: 0 }}>
            <EntityConversation entityType="question" entity={q} accent={ACCENT} />
          </div>
        </div>
      )}
      {tab === "observations" && <ObservationsTab entityType="question" entityId={q.id} entityName={q.title} />}
      {tab === "predictions" && <PredictionsTab entityType="question" entityId={q.id} entityName={q.title} />}
      {tab === "worldview" && <WorldviewTab entityType="question" entityId={q.id} entityName={q.title} />}
      {tab === "tasks" && <TasksTab entityType="question" entityId={q.id} entityName={q.title} />}
      {tab === "sources" && <SourcesTab entityType="question" entityId={q.id} entityName={q.title || ""} canEdit={owner} />}
      {tab === "history" && <EntityHistoryTab entityType="question" entityId={q.id} isOwner={owner} />}
      {tab === "images" && <FilesTab entityType="question" entityId={q.id} isOwner={owner} />}
      {renderExtraTab && renderExtraTab(tab)}
    </EntityPage>
  )
}


// ── Page ─────────────────────────────────────────────────────────────────
function QuestionsPageInner() {
  const t = useT()
  const user = useStore(s => s.user)
  const qc = useQueryClient()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { data = [], isLoading } = useQuery({ queryKey: ["questions"], queryFn: () => questionApi.list() })
  const [modal, setModal] = useState<null | "create" | any>(null)
  const [selected, setSelected] = useState<any>(null)
  const { data: labs = [] } = useMyLabs()
  const [search, setSearch] = useState("")
  const [hov, setHov] = useState<number | null>(null)
  const [statusFilter, setStatusFilter] = useState<Record<string, boolean>>({})
  // Гость по умолчанию видит "Публичное" — вкладка "Личное" для него
  // и вовсе скрыта (см. VisibilityTabs isGuest), дефолт "private" был бы
  // тупиком: пустой список без объяснения, почему он пуст.
  const [activeVisibility, setActiveVisibility] = useState<VisibilityValue>(user ? "private" : "public")
  const [activeLabId, setActiveLabId] = useState<number | null>(null)
  const [tab, setTab] = useState<string>(searchParams.get("tab") ?? "detail")



  const isMobile = useIsMobile()
  const { selectEntity, clearSelection } = useEntityUrlSync(data as any[], selected, setSelected, (idOrSlug) => questionApi.get(idOrSlug), isMobile, () => filtered)
  const selectQ = (q: any) => {
    setTab("detail")
    selectEntity(q)
  }

  const changeTab = (t: string) => {
    setTab(t)
    const p = new URLSearchParams(searchParams.toString())
    p.set("tab", t)
    router.replace(`?${p.toString()}`)
  }

  const activeStatuses = Object.keys(statusFilter).filter(k => statusFilter[k])
  const preVisibility = data.filter((q: any) => {
    if (search.trim()) {
      const qq = search.toLowerCase()
      const matches = q.title?.toLowerCase().includes(qq) || q.tags?.some((t: string) => t.toLowerCase().includes(qq))
      if (!matches) return false
    }
    if (activeStatuses.length > 0 && !activeStatuses.includes(q.status)) return false
    return true
  })
  const visibilityCounts = {
    private: preVisibility.filter((q: any) => matchesVisibilityFilter(q, ["private"])).length,
    lab: preVisibility.filter((q: any) => matchesVisibilityFilter(q, ["lab"])).length,
    public: preVisibility.filter((q: any) => matchesVisibilityFilter(q, ["public"])).length,
  }
  const filtered = preVisibility.filter((q: any) => {
    if (!matchesVisibilityFilter(q, [activeVisibility])) return false
    if (activeLabId && q.lab_id !== activeLabId) return false
    return true
  })
  const { items: pendingAnswerItems } = useQuestionAnswerPending()
  const pendingCountByQuestion = new Map<number, number>()
  pendingAnswerItems.forEach((it: any) => {
    pendingCountByQuestion.set(it.question_id, (pendingCountByQuestion.get(it.question_id) ?? 0) + 1)
  })
  const sorted = [...filtered].sort((a: any, b: any) => {
    const aPending = pendingCountByQuestion.has(a.id) ? 1 : 0
    const bPending = pendingCountByQuestion.has(b.id) ? 1 : 0
    return bPending - aPending
  })
  const { page, setPage, pageCount, paged, pageSize } = usePagination(sorted)
  const listTr = useListContentTranslation("question", paged, ["title"], (q: any) => isOwner(user, q))
  const dtPriority = useDynamicTranslate(PRIORITIES, { noYo: true })

  const create = useMutation({
    mutationFn: ({ _links, _images, _pendingFiles, ...body }: any) => questionApi.create(body),
    onSuccess: async (nq: any, variables: any) => {
      if (variables._links?.length) await createLinksFor("question", nq.id, variables._links)
      if (variables._images?.length) await uploadImagesFor("question", nq.id, variables._images)
      if (variables._pendingFiles && variables._pendingFiles.size > 0) {
        let newText = nq.text ?? ""
        let newAnswer = nq.answer ?? ""
        for (const [blobUrl, file] of variables._pendingFiles) {
          const uploaded = await imageApi.upload("question", nq.id, [file])
          const url = resolveMediaUrl(uploaded?.[0]?.url)
          if (url) {
            newText = newText.split(blobUrl).join(url)
            newAnswer = newAnswer.split(blobUrl).join(url)
          }
          URL.revokeObjectURL(blobUrl)
        }
        if (newText !== (nq.text ?? "") || newAnswer !== (nq.answer ?? "")) {
          await questionApi.update(nq.id, { ...nq, tags: nq.tags ?? [], text: newText, answer: newAnswer })
        }
      }
      qc.invalidateQueries({ queryKey: ["questions"] }); setModal(null); setSelected(nq)
    },
  })
  const update = useMutation({
    mutationFn: ({ id, d }: any) => {
      const { _links, _images, _pendingFiles, ...body } = d
      return updateEntityWithLinks("question", id, questionApi.update, body, _links, _images)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["questions"] }); setModal(null) },
  })
  const remove = useMutation({ mutationFn: questionApi.delete, onSuccess: () => { qc.invalidateQueries({ queryKey: ["questions"] }); setSelected(null) } })

  return (
    <PageShell>
      <Header titleKey="page.questions.title" color={ACCENT} icon={<HelpCircle size={16} style={{ color: ACCENT }} />}
        actions={
          user ? (
            <Button variant="primary" size="sm" onClick={() => setModal("create")} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Plus size={13} /> {t("actions.createQuestionAction")}
            </Button>
          ) : undefined
        } />

      <PageContent overflow="visible" noPadding>
        <div style={SPLIT_BODY_STYLE}>
          <ResizableLayout
            accent={ACCENT}
            backLabel="Вопросы"
            showRight={!!selected}
            onBack={() => setSelected(null)}
            left={
              <div style={{ width: "100%", height: "100%", background: theme.bg1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                <PaginationBar total={filtered.length} page={page} pageSize={pageSize} pageCount={pageCount} onPageChange={setPage} />
                <div style={sectionSearchWrap()}>
                  <Search size={13} style={{ position: "absolute", left: 22, top: "50%", transform: "translateY(-50%)", color: "#848cb0", pointerEvents: "none" }} />
                  <input value={search} onChange={e => { setSearch(e.target.value); setPage(0) }} placeholder="Поиск по вопросам…"
                    style={sectionSearch(ACCENT)}
                    onFocus={e => (e.target as HTMLInputElement).style.borderColor = `${ACCENT}40`}
                    onBlur={e => (e.target as HTMLInputElement).style.borderColor = "#1e1e2a"} />
                </div>
                <VisibilityTabs
                  active={activeVisibility}
                  isGuest={!user}
                  onChange={v => { setActiveVisibility(v); setPage(0); clearSelection() }}
                  counts={visibilityCounts}
                  labs={labs}
                  activeLabId={activeLabId}
                  onLabChange={id => { setActiveLabId(id); setPage(0) }}
                />
                <ListFilters
                  statuses={STATUSES}
                  activeStatuses={statusFilter}
                  onToggleStatus={s => { setStatusFilter(p => ({ ...p, [s]: !p[s] })); setPage(0) }}
                  accent={ACCENT}
                  showVisibility={false}
                />
                <div style={{ overflowY: "auto", flex: 1, minHeight: 0 }}>
                  {isLoading ? (
                    [...Array(5)].map((_, i) => <div key={i} style={{ height: 64, borderBottom: "1px solid #111", opacity: 0.5 - i * 0.08 }} />)
                  ) : filtered.length === 0 ? (
                    <div style={{ padding: "32px 16px", textAlign: "center", color: "#9999a1", fontSize: 13 }}>
                      {search ? t("questions.emptyFiltered") : t("questions.emptyNone")}
                    </div>
                  ) : paged.map((q: any) => {
                    const isActive = selected?.id === q.id
                    const isHov = hov === q.id
                    return (
                      <EntityListItem
                        key={q.id}
                        id={q.id}
                        isActive={isActive}
                        accent={ACCENT}
                        onClick={() => selectQ(q)}
                        date={q.created_at}
                        title={listTr(q, "title", q.title)}
                        status={q.status}
                        statusExtra={
                          <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: `${PCOLOR[q.priority]}18`, color: PCOLOR[q.priority], border: `1px solid ${PCOLOR[q.priority]}33`, fontWeight: 600 }}>
                            {dtPriority(q.priority)}
                          </span>
                        }
                        rightIcon={pendingCountByQuestion.has(q.id) ? <QuestionAnswerBadge count={pendingCountByQuestion.get(q.id)} /> : undefined}
                        onEdit={isOwner(user, q) ? () => setModal(q) : undefined}
                        progressBar={q.importance != null ? <MiniScale name={t("questions.importanceLabel")} value={q.importance} min={0} max={5} levels={IMPORTANCE_SCALE.levels} color={ACCENT} /> : undefined}
                        onDelete={isOwner(user, q) ? () => remove.mutate(q.id) : undefined}
                        deleteConfirmText={buildTrashConfirmText(t, "question", q)}
                      />
                    )
                  })}
                </div>
              </div>
            }
            right={selected ? (
              <DetailPanel accent={ACCENT} noTopBorder>
                <QDetail q={selected} onEdit={isOwner(user, selected) ? () => setModal(selected) : undefined} tab={tab} setTab={changeTab} />
              </DetailPanel>
            ) : (
              <DetailPanelEmpty accent={ACCENT} />
            )}
          />
        </div>
      </PageContent>

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal === "create" ? "Новый вопрос" : "Редактировать вопрос"} size="lg">
        <QForm initial={modal !== "create" ? modal : undefined} labs={labs}
          onSave={(d: any) => modal === "create" ? create.mutate(d) : update.mutate({ id: modal.id, d })}
          onCancel={() => setModal(null)} />
      </Modal>
    </PageShell>
  )
}

export default function QuestionsPage() {
  return (
    <Suspense>
      <QuestionsPageInner />
    </Suspense>
  )
}
