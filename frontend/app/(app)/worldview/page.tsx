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
import { wvApi, imageApi, resolveMediaUrl } from "@/lib/api"
import { useMyLabs } from "@/lib/use-my-labs"
import { Header } from "@/components/layout/header"
import { Button } from "@/components/ui/button"
import { Modal } from "@/components/ui/modal"
import { Input, Textarea } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { PageShell, PageContent, SPLIT_BODY_STYLE } from "@/components/layout/page-shell"
import { ResizableLayout, useIsMobile } from "@/components/layout/resizable-layout"
import { DetailPanel, DetailPanelEmpty } from "@/components/layout/detail-panel"
import { EntityQuickAddMenu } from "@/components/entities/entity-quick-add-menu"
import { getVisibilityOptions } from "@/lib/visibility-levels"
import { ObservationsTab, PredictionsTab } from "@/components/entities/relations-panel"
import { WorldviewTab } from "@/components/entities/worldview-tab"
import { TasksTab } from "@/components/entities/tasks-tab"
import { SourcesTab } from "@/components/hypotheses/sources-tab"
import { FilesTab } from "@/components/entities/files-tab"
import { EntityHistoryTab, historyTabs } from "@/components/entities/entity-history-tab"
import { EntityConversation } from "@/components/entities/entity-conversation"
import { WorldviewReflection } from "@/components/entities/worldview-reflection"
import { ListFilters } from "@/components/entities/list-filters"
import { VisibilityTabs } from "@/components/entities/visibility-tabs"
import { usePagination, PaginationBar } from "@/components/layout/pagination"
import { DateStamp } from "@/components/ui/date-stamp"
import { Ruler } from "@/components/ui/ruler"
import { DEFAULT_SCALES } from "@/lib/scales"
const CONFIDENCE_SCALE = DEFAULT_SCALES.find(s => s.id === "confidence" && s.entity_type === "worldview")!

import { formatEntityStampFull } from "@/lib/theme"
import { useStore } from "@/lib/store"
import { isOwner } from "@/lib/ownership"
import { ContradictionNudge } from "@/components/entities/contradiction-nudge"
import { usePostCreateReflection } from "@/lib/use-post-create-reflection"
import { EntityListItem } from "@/components/layout/entity-list-item"
import { StatusBadge } from "@/components/ui/status-badge"
import { EditDeleteActions } from "@/components/layout/entity-row-actions"
import { VisibilityValue } from "@/components/ui/orbit-selector"
import { statusBadge, tag, typeColor, sectionSearch, sectionSearchWrap, theme } from "@/lib/theme"
import { useT } from "@/lib/i18n/useT"
import { EvidencePanels, isBlankHtml } from "@/components/entities/evidence-panels"
import { EntityPage } from "@/components/layout/entity-page"
import { ActionButton } from "@/components/ui/action-button"
import { AuthorChip } from "@/components/entities/author-chip"
import { EntityPassport } from "@/components/entities/passport"
import { EntityKnowledge } from "@/components/entities/entity-knowledge"
import { useRelatedGroups } from "@/lib/use-related-groups"
import { resolveEntityTab, relatedTabsFor } from "@/lib/entity-tab"
import { buildTrashConfirmText } from "@/lib/trash-confirm"
import { useTranslatedField, useListContentTranslation } from "@/lib/i18n/useContentT"
import { useDynamicTranslate } from "@/lib/i18n/useDynamicT"
import { Plus, Globe, Search, Pencil } from "lucide-react"
import { format } from "date-fns"

const ACCENT = typeColor.worldview
const STATUSES = ["гипотеза", "частично подтверждается", "подтверждается", "пересматривается", "отвергнуто"]

// ── Form ─────────────────────────────────────────────────────────────────
function WvForm({ initial, onSave, onCancel }: any) {
  const t = useT()
  const dt = useDynamicTranslate(STATUSES, { noYo: true })
  const [form, setForm] = useState({
    date: initial?.date ?? format(new Date(), "yyyy-MM-dd"),
    belief: initial?.belief ?? "", status: initial?.status ?? "гипотеза",
    confirming_data: initial?.confirming_data ?? "",
    refuting_data: initial?.refuting_data ?? "",
    tags: (initial?.tags ?? []).join(", "),
  })
  const [links, setLinks] = useState<PendingLink[]>([])
  const [images, setImages] = useState<File[]>([])
  // Картинки, вставленные ПРЯМО В confirming_data/refuting_data через
  // RichTextEditor — общий Map для обоих полей (см. тот же паттерн в QForm).
  const pendingFilesRef = useRef<Map<string, File>>(new Map())
  const f = (k: string) => (e: any) => setForm(p => ({ ...p, [k]: e.target.value }))
  return (
    <form onSubmit={e => { e.preventDefault(); onSave({ ...form, tags: form.tags.split(",").map((t: string) => t.trim()).filter(Boolean), _links: links, _images: images, _pendingFiles: pendingFilesRef.current }) }}
      style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Input label={t("worldview.dateLabel")} type="date" value={form.date} onChange={f("date")} />
        <Select label={t("field.status")} value={form.status} onChange={f("status")} options={STATUSES.map(s => ({ value: s, label: dt(s) }))} />
      </div>
      <Textarea label={t("worldview.beliefLabel")} placeholder={t("worldview.beliefPlaceholder")} value={form.belief} onChange={f("belief")} rows={3} required />
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label style={{ fontSize: 12, color: "#9696a1" }}>{t("worldview.confirmingLabel")}</label>
        <RichTextEditor value={form.confirming_data} onChange={html => setForm(p => ({ ...p, confirming_data: html }))}
          entityType="worldview" entityId={initial?.id ?? null} placeholder={t("worldview.confirmingPlaceholder")}
          onPendingFileAdded={(url, file) => pendingFilesRef.current.set(url, file)} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label style={{ fontSize: 12, color: "#9696a1" }}>{t("worldview.refutingLabel")}</label>
        <RichTextEditor value={form.refuting_data} onChange={html => setForm(p => ({ ...p, refuting_data: html }))}
          entityType="worldview" entityId={initial?.id ?? null} placeholder={t("worldview.refutingPlaceholder")}
          onPendingFileAdded={(url, file) => pendingFilesRef.current.set(url, file)} />
      </div>
      <Input label={t("hypotheses.tagsLabel")} placeholder={t("worldview.tagsPlaceholder")} value={form.tags} onChange={f("tags")} />
      <EntityLinkPicker value={links} onChange={setLinks} excludeType="worldview" excludeId={initial?.id} />
      <LocalImagePicker value={images} onChange={setImages} />
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Button type="button" variant="ghost" onClick={onCancel}>{t("actions.cancel")}</Button>
        <Button type="submit" variant="primary">{t("actions.save")}</Button>
      </div>
    </form>
  )
}

// ── Detail ───────────────────────────────────────────────────────────────
function WvDetail({ wv, onEdit, tab: rawTab, setTab }: { wv: any; onEdit?: () => void; tab: string; setTab: (t: string) => void }) {
  const t = useT()
  const user = useStore(s => s.user)
  const locale = useStore(s => s.locale)
  const qc = useQueryClient()
  const tab = resolveEntityTab(rawTab)
  const owner = isOwner(user, wv)
  const { counts } = useRelatedGroups("worldview", wv.id)
  const translatedBelief = useTranslatedField("worldview", wv.id, "belief", wv.belief, isOwner(user, wv))
  const translatedConfirming = useTranslatedField("worldview", wv.id, "confirming_data", wv.confirming_data, isOwner(user, wv))
  const translatedRefuting = useTranslatedField("worldview", wv.id, "refuting_data", wv.refuting_data, isOwner(user, wv))
  const updateScale = useMutation({
    mutationFn: (patch: Record<string, number | null>) => wvApi.update(wv.id, { ...wv, tags: wv.tags ?? [], ...patch }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["worldview"] }),
  })

  return (
    <EntityPage
      accent={ACCENT}
      icon={<Globe size={14} />}
      kicker={t("worldview.kicker")}
      dateStr={formatEntityStampFull(wv.created_at ?? wv.date, locale)}
      title={translatedBelief}
      tags={wv.tags?.length > 0 ? wv.tags.map((tg: string) => <span key={tg} style={tag(ACCENT)}>{tg}</span>) : undefined}
      actions={
        <>
          {onEdit && (
            <ActionButton variant="primary" accent={ACCENT} icon={<Pencil size={14} />} onClick={onEdit}>
              {t("actions.edit")}
            </ActionButton>
          )}
          {user && <EntityQuickAddMenu entityType="worldview" entityId={wv.id} entityName={wv.belief?.slice(0, 80) || ""} />}
        </>
      }
      insights={
        <>
          {onEdit && <WorldviewReflection worldviewId={wv.id} />}
          <ContradictionNudge entityType="worldview" entityId={wv.id} text={wv.belief} accent={ACCENT} isOwner={owner} />
        </>
      }
      passport={compact => (
        <EntityPassport
          entityType="worldview"
          entityId={wv.id}
          values={wv}
          onSave={patch => updateScale.mutate(patch)}
          isPending={updateScale.isPending}
          isOwner={owner}
          accent={ACCENT}
          compact={compact}
          meta={[
            { label: t("passport.status"), node: <StatusBadge status={wv.status} fontSize={12} /> },
            ...((wv.owner_display_name || wv.owner_username) ? [{ label: t("passport.author"), node: <AuthorChip name={wv.owner_display_name || wv.owner_username} username={wv.owner_username} /> }] : []),
          ]}
        />
      )}
      tabs={[
        { id: "detail",       label: t("tabs.detail")      },
        { id: "observations", label: t("tabs.observations"), count: counts.observation },
        { id: "predictions",  label: t("tabs.predictions"),  count: counts.prediction },
        { id: "worldview",    label: t("tabs.worldview"),    count: counts.worldview },
        { id: "tasks",        label: t("tabs.tasks"),        count: counts.task },
        { id: "sources",      label: t("tabs.sources")     },
        { id: "images",       label: t("tabs.files")       },
        ...historyTabs(t, owner),
      ]}
      activeTab={tab}
      onTabChange={id => setTab(id)}
      scrollKey={wv.id}
    >
      {tab === "detail" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 28, minWidth: 0 }}>
          {(!isBlankHtml(wv.confirming_data) || !isBlankHtml(wv.refuting_data) || owner) && (
            <EvidencePanels
              accent={ACCENT}
              confirmingHtml={translatedConfirming}
              refutingHtml={translatedRefuting}
              canEdit={owner}
              onEdit={onEdit}
            />
          )}
          <EntityKnowledge
            entityType="worldview" entityId={wv.id} entityTitle={translatedBelief} accent={ACCENT}
            addAction={user ? <EntityQuickAddMenu entityType="worldview" entityId={wv.id} entityName={wv.belief?.slice(0, 80) || ""} /> : undefined}
            tabForType={relatedTabsFor("worldview")}
            onOpenTab={setTab}
          />
          <div style={{ borderTop: `1px solid ${theme.ln1}`, paddingTop: 24, minWidth: 0 }}>
            <EntityConversation entityType="worldview" entity={wv} accent={ACCENT} />
          </div>
        </div>
      )}
      {tab === "observations" && <ObservationsTab entityType="worldview" entityId={wv.id} entityName={wv.belief?.slice(0, 80)} />}
      {tab === "predictions" && <PredictionsTab entityType="worldview" entityId={wv.id} entityName={wv.belief?.slice(0, 80)} />}
      {tab === "worldview" && <WorldviewTab entityType="worldview" entityId={wv.id} entityName={wv.belief?.slice(0, 80)} />}
      {tab === "tasks" && <TasksTab entityType="worldview" entityId={wv.id} entityName={wv.belief?.slice(0, 80)} />}
      {tab === "sources" && <SourcesTab entityType="worldview" entityId={wv.id} entityName={wv.belief?.slice(0, 80) || ""} canEdit={owner} />}
      {tab === "history" && <EntityHistoryTab entityType="worldview" entityId={wv.id} isOwner={owner} />}
      {tab === "images" && <FilesTab entityType="worldview" entityId={wv.id} isOwner={owner} />}
    </EntityPage>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────
function WorldviewPageInner() {
  const t = useT()
  const user = useStore(s => s.user)
  const qc = useQueryClient()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { data = [], isLoading } = useQuery({ queryKey: ["worldview"], queryFn: () => wvApi.list() })
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
  const { selectEntity, clearSelection } = useEntityUrlSync(data as any[], selected, setSelected, (idOrSlug) => wvApi.get(idOrSlug), isMobile, () => filtered)
  const selectWv = (w: any) => {
    setTab("detail")
    selectEntity(w)
  }

  const changeTab = (t: string) => {
    setTab(t)
    const p = new URLSearchParams(searchParams.toString())
    p.set("tab", t)
    router.replace(`?${p.toString()}`)
  }

  const activeStatuses = Object.keys(statusFilter).filter(k => statusFilter[k])
  const preVisibility = data.filter((w: any) => {
    if (search.trim()) {
      const q = search.toLowerCase()
      const matches = w.belief?.toLowerCase().includes(q) || w.tags?.some((t: string) => t.toLowerCase().includes(q))
      if (!matches) return false
    }
    if (activeStatuses.length > 0 && !activeStatuses.includes(w.status)) return false
    return true
  })
  const visibilityCounts = {
    private: preVisibility.filter((w: any) => matchesVisibilityFilter(w, ["private"])).length,
    lab: preVisibility.filter((w: any) => matchesVisibilityFilter(w, ["lab"])).length,
    public: preVisibility.filter((w: any) => matchesVisibilityFilter(w, ["public"])).length,
  }
  const filtered = preVisibility.filter((w: any) => {
    if (!matchesVisibilityFilter(w, [activeVisibility])) return false
    if (activeLabId && w.lab_id !== activeLabId) return false
    return true
  })
  const { page, setPage, pageCount, paged, pageSize } = usePagination(filtered)
  const listTr = useListContentTranslation("worldview", paged, ["belief"], (w: any) => isOwner(user, w))

  const { show: showPostCreateReflection, modalNode: postCreateReflectionNode } = usePostCreateReflection("worldview")
  const create = useMutation({
    mutationFn: ({ _links, _images, _pendingFiles, ...body }: any) => wvApi.create(body),
    onSuccess: async (nw: any, variables: any) => {
      if (variables._links?.length) await createLinksFor("worldview", nw.id, variables._links)
      if (variables._images?.length) await uploadImagesFor("worldview", nw.id, variables._images)
      if (variables._pendingFiles && variables._pendingFiles.size > 0) {
        let newConfirming = nw.confirming_data ?? ""
        let newRefuting = nw.refuting_data ?? ""
        for (const [blobUrl, file] of variables._pendingFiles) {
          const uploaded = await imageApi.upload("worldview", nw.id, [file])
          const url = resolveMediaUrl(uploaded?.[0]?.url)
          if (url) {
            newConfirming = newConfirming.split(blobUrl).join(url)
            newRefuting = newRefuting.split(blobUrl).join(url)
          }
          URL.revokeObjectURL(blobUrl)
        }
        if (newConfirming !== (nw.confirming_data ?? "") || newRefuting !== (nw.refuting_data ?? "")) {
          await wvApi.update(nw.id, { ...nw, tags: nw.tags ?? [], confirming_data: newConfirming, refuting_data: newRefuting })
        }
      }
      qc.invalidateQueries({ queryKey: ["worldview"] }); setModal(null); setSelected(nw)
      showPostCreateReflection({ id: nw.id })
    },
  })
  const update = useMutation({
    mutationFn: ({ id, d }: any) => {
      const { _links, _images, _pendingFiles, ...body } = d
      return updateEntityWithLinks("worldview", id, wvApi.update, body, _links, _images)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["worldview"] }); setModal(null) },
  })
  const remove = useMutation({ mutationFn: wvApi.delete, onSuccess: () => { qc.invalidateQueries({ queryKey: ["worldview"] }); setSelected(null) } })

  return (
    <PageShell>
      <Header titleKey="page.worldview.title" color={ACCENT} icon={<Globe size={16} style={{ color: ACCENT }} />}
        actions={
          user ? (
            <Button variant="primary" size="sm" onClick={() => setModal("create")} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Plus size={13} /> {t("actions.createWorldviewAction")}
            </Button>
          ) : undefined
        } />

      <PageContent overflow="visible" noPadding>
        <div style={SPLIT_BODY_STYLE}>
          <ResizableLayout
            accent={ACCENT}
            backLabel={t("worldview.backLabel")}
            showRight={!!selected}
            onBack={() => setSelected(null)}
            left={
              <div style={{ width: "100%", height: "100%", background: theme.bg1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                <PaginationBar total={filtered.length} page={page} pageSize={pageSize} pageCount={pageCount} onPageChange={setPage} />
                <div style={sectionSearchWrap()}>
                  <Search size={13} style={{ position: "absolute", left: 22, top: "50%", transform: "translateY(-50%)", color: "#848cb0", pointerEvents: "none" }} />
                  <input value={search} onChange={e => { setSearch(e.target.value); setPage(0) }} placeholder={t("worldview.searchPlaceholder")}
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
                      {search ? t("worldview.emptyFiltered") : t("worldview.emptyNone")}
                    </div>
                  ) : paged.map((w: any) => {
                    const isActive = selected?.id === w.id
                    const isHov = hov === w.id
                    return (
                      <EntityListItem
                        key={w.id}
                        id={w.id}
                        isActive={isActive}
                        accent={ACCENT}
                        onClick={() => selectWv(w)}
                        date={w.created_at}
                        title={listTr(w, "belief", w.belief)}
                        status={w.status}
                        onEdit={isOwner(user, w) ? () => setModal(w) : undefined}
                        onDelete={isOwner(user, w) ? () => remove.mutate(w.id) : undefined}
                        progressBar={w.confidence != null ? <Ruler name={t("worldview.confidenceLabel")} value={w.confidence} min={1} max={5} levels={CONFIDENCE_SCALE.levels} color={ACCENT} /> : undefined}
                        deleteConfirmText={buildTrashConfirmText(t, "worldview", w)}
                      />
                    )
                  })}
                </div>
              </div>
            }
            right={selected ? (
              <DetailPanel accent={ACCENT} noTopBorder>
                <WvDetail wv={selected} onEdit={isOwner(user, selected) ? () => setModal(selected) : undefined} tab={tab} setTab={changeTab} />
              </DetailPanel>
            ) : (
              <DetailPanelEmpty accent={ACCENT} />
            )}
          />
        </div>
      </PageContent>

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal === "create" ? t("worldview.createTitle") : t("worldview.editTitle")} size="lg">
        <WvForm initial={modal !== "create" ? modal : undefined}
          onSave={(d: any) => modal === "create" ? create.mutate(d) : update.mutate({ id: modal.id, d })}
          onCancel={() => setModal(null)} />
      </Modal>
      {postCreateReflectionNode}
    </PageShell>
  )
}

export default function WorldviewPage() {
  return (
    <Suspense>
      <WorldviewPageInner />
    </Suspense>
  )
}
