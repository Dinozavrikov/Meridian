"use client"
import { createHypothesisFull } from "@/lib/create-hypothesis"
import { usePartialCreateNotice } from "@/lib/use-partial-create-notice"
import { useMutationErrorText } from "@/lib/use-mutation-error-text"
import React, { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { updateEntityWithLinks } from "@/lib/entity-update-with-links"
import { HypForm, getMaturity } from "@/components/entities/hypothesis-form"
import { HYPOTHESIS_STATUSES } from "@/lib/hypothesis-constants"
import { hypApi } from "@/lib/api"
import { useMyLabs } from "@/lib/use-my-labs"
import { renderableHtml } from "@/lib/render-safe-html"
import { RichHtml } from "@/components/entities/rich-html"
import { stripHtml } from "@/lib/strip-html"
import { matchesVisibilityFilter } from "@/lib/entity-filters"
import { Header } from "@/components/layout/header"
import { Button } from "@/components/ui/button"
import { Modal } from "@/components/ui/modal"
import { ObservationsTab, PredictionsTab } from "@/components/entities/relations-panel"
import { useEntityUrlSync } from "@/lib/use-entity-url-sync"
import { WorldviewTab } from "@/components/entities/worldview-tab"
import { TasksTab } from "@/components/entities/tasks-tab"
import { EntityConversation } from "@/components/entities/entity-conversation"
import { SourcesTab } from "@/components/hypotheses/sources-tab"
import { FilesTab } from "@/components/entities/files-tab"
import { EntityHistoryTab, historyTabs } from "@/components/entities/entity-history-tab"
import { sectionSearch, sectionSearchWrap, listPanel, tag } from "@/lib/theme"
import { StatusBadge } from "@/components/ui/status-badge"
import { formatEntityStampFull } from "@/lib/theme"
import { EntityListItem } from "@/components/layout/entity-list-item"
import { useStore } from "@/lib/store"
import { isOwner } from "@/lib/ownership"
import { Plus, Lightbulb, Search, Pencil } from "lucide-react"
import { PageShell, PageContent, SPLIT_BODY_STYLE } from "@/components/layout/page-shell"
import { usePagination, PaginationBar } from "@/components/layout/pagination"
import { ResizableLayout, useIsMobile } from "@/components/layout/resizable-layout"
import { DetailPanel, DetailPanelEmpty } from "@/components/layout/detail-panel"
import { EntityQuickAddMenu } from "@/components/entities/entity-quick-add-menu"
import { VisibilityValue } from "@/components/ui/orbit-selector"
import { ListFilters } from "@/components/entities/list-filters"
import { VisibilityTabs } from "@/components/entities/visibility-tabs"
import { Ruler } from "@/components/ui/ruler"
import { DEFAULT_SCALES } from "@/lib/scales"
const MATURITY_SCALE = DEFAULT_SCALES.find(s => s.id === "maturity" && s.entity_type === "hypothesis")!

import { ContradictionNudge } from "@/components/entities/contradiction-nudge"
import { MaturitySuggestionBanner } from "@/components/entities/maturity-suggestion-banner"
import { MaturityProgress } from "@/components/entities/maturity-progress"
import { EvidenceDiversityBadge } from "@/components/entities/evidence-diversity-badge"
import { SuggestedObservationsButton } from "@/components/entities/suggested-observations-button"
import { useT } from "@/lib/i18n/useT"
import { EntityPage } from "@/components/layout/entity-page"
import { ActionButton } from "@/components/ui/action-button"
import { AuthorChip } from "@/components/entities/author-chip"
import { EntityPassport } from "@/components/entities/passport"
import { EntityKnowledge } from "@/components/entities/entity-knowledge"
import { useRelatedGroups } from "@/lib/use-related-groups"
import { resolveEntityTab, relatedTabsFor } from "@/lib/entity-tab"
import { buildTrashConfirmText } from "@/lib/trash-confirm"
import { useTranslatedField, useListContentTranslation } from "@/lib/i18n/useContentT"

const ACCENT = "#4A90D9"

// ── Maturity bar (interactive) ─────────────────────────────────────────────

// ── HypDetail ──────────────────────────────────────────────────────────────
function HypDetail({ hyp, labs, onEdit, tab: rawTab, setTab }: { hyp: any; labs: any[]; onEdit: () => void; tab: string; setTab: (t: any) => void }) {
  const t = useT()
  const qc = useQueryClient()
  const user = useStore(s => s.user)
  const tab = resolveEntityTab(rawTab)
  const owner = isOwner(user, hyp)
  const { counts } = useRelatedGroups("hypothesis", hyp.id)

  const locale = useStore(s => s.locale)
  const dateStr = formatEntityStampFull(hyp.created_at ?? hyp.date_created, locale) ?? ""
  const translatedName = useTranslatedField("hypothesis", hyp.id, "name", hyp.name, isOwner(user, hyp))
  const translatedDescription = useTranslatedField("hypothesis", hyp.id, "description", hyp.description, isOwner(user, hyp))


  const updateScale = useMutation({
    mutationFn: (patch: Partial<Pick<typeof hyp, "maturity" | "stability" | "research_load" | "risk">>) => hypApi.update(hyp.id, {
      ...hyp,
      maturity: hyp.maturity ?? 0,
      stability: hyp.stability ?? 5,
      research_load: hyp.research_load ?? 5,
      risk: hyp.risk ?? 5,
      tags: hyp.tags ?? [],
      ...patch,
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hypotheses"] }),
  })


  return (
    <EntityPage
      accent={ACCENT}
      icon={<Lightbulb size={14} />}
      kicker={t("hypotheses.kicker")}
      dateStr={dateStr}
      title={translatedName}
      tags={hyp.tags?.length > 0 ? hyp.tags.map((tg: string) => <span key={tg} style={tag(ACCENT)}>{tg}</span>) : undefined}
      actions={
        <>
          {owner && (
            <ActionButton variant="primary" accent={ACCENT} icon={<Pencil size={14} />} onClick={onEdit}>
              {t("actions.edit")}
            </ActionButton>
          )}
          {user && <EntityQuickAddMenu entityType="hypothesis" entityId={hyp.id} entityName={hyp.name} />}
          {owner && <SuggestedObservationsButton hypothesisId={hyp.id} />}
        </>
      }
      insights={
        <>
          <MaturitySuggestionBanner hypothesisId={hyp.id} />
          {owner && <MaturityProgress hypothesisId={hyp.id} />}
          <EvidenceDiversityBadge hypothesisId={hyp.id} />
          <ContradictionNudge entityType="hypothesis" entityId={hyp.id} text={`${hyp.name}. ${stripHtml(hyp.description || "")}`} accent={ACCENT} isOwner={owner} />
        </>
      }
      passport={compact => (
        <EntityPassport
          entityType="hypothesis"
          entityId={hyp.id}
          values={hyp}
          onSave={patch => updateScale.mutate(patch)}
          isPending={updateScale.isPending}
          isOwner={owner}
          accent={ACCENT}
          compact={compact}
          meta={[
            { label: t("passport.status"), node: <StatusBadge status={hyp.status} fontSize={12} /> },
            ...((hyp.owner_display_name || hyp.owner_username) ? [{ label: t("passport.author"), node: <AuthorChip name={hyp.owner_display_name || hyp.owner_username} username={hyp.owner_username} /> }] : []),
          ]}
        />
      )}
      tabs={[
        { id: "detail",       label: t("tabs.detail")      },
        { id: "observations", label: t("tabs.observations"), count: counts.observation },
        { id: "predictions",  label: t("tabs.predictions"),  count: counts.prediction },
        { id: "worldview",    label: t("tabs.worldview"), count: counts.worldview   },
        { id: "tasks",        label: t("tabs.tasks"), count: counts.task       },
        { id: "sources",      label: t("tabs.sources")     },
        { id: "images",       label: t("tabs.files")       },
        ...historyTabs(t, owner),
      ]}
      activeTab={tab}
      onTabChange={id => setTab(id)}
      scrollKey={hyp.id}
    >
      {tab === "detail" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 28, minWidth: 0 }}>
          {hyp.description && (
            <RichHtml html={renderableHtml(translatedDescription)} accent={ACCENT} style={{ fontSize: 16, color: "#d4d2cd", lineHeight: 1.75, maxWidth: 760, margin: 0 }} />
          )}
          <EntityKnowledge
            entityType="hypothesis" entityId={hyp.id} entityTitle={translatedName} accent={ACCENT}
            addAction={user ? <EntityQuickAddMenu entityType="hypothesis" entityId={hyp.id} entityName={hyp.name} /> : undefined}
            tabForType={relatedTabsFor("hypothesis")}
            onOpenTab={setTab}
          />
          <div style={{ borderTop: "1px solid #262b42", paddingTop: 24, minWidth: 0 }}>
            <EntityConversation entityType="hypothesis" entity={hyp} accent={ACCENT} />
          </div>
        </div>
      )}
      {tab === "observations" && <ObservationsTab entityType="hypothesis" entityId={hyp.id} entityName={hyp.name} />}
      {tab === "predictions" && <PredictionsTab entityType="hypothesis" entityId={hyp.id} entityName={hyp.name} />}
      {tab === "worldview" && <WorldviewTab entityType="hypothesis" entityId={hyp.id} entityName={hyp.name} />}
      {tab === "tasks" && <TasksTab entityType="hypothesis" entityId={hyp.id} entityName={hyp.name} />}
      {tab === "sources" && <SourcesTab entityType="hypothesis" entityId={hyp.id} entityName={hyp.name} canEdit={owner} />}
      {tab === "history" && <EntityHistoryTab entityType="hypothesis" entityId={hyp.id} isOwner={owner} />}
      {tab === "images" && <FilesTab entityType="hypothesis" entityId={hyp.id} isOwner={owner} />}
    </EntityPage>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────
function HypothesesPageInner() {
  const t = useT()
  const { user } = useStore()
  const qc = useQueryClient()
  const searchParams = useSearchParams()
  const isMobile = useIsMobile()

  const { data = [], isLoading } = useQuery({ queryKey: ["hypotheses"], queryFn: () => hypApi.list() })
  const { data: labs = [] } = useMyLabs()

  const router = useRouter()
  const [modal, setModal] = useState<null | "create" | any>(null)
  const [selected, setSelected] = useState<any>(null)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<Record<string, boolean>>({})
  // По умолчанию "Личное" — это основной "дом" пользователя (по умолчанию все
  // записи приватны, см. docs). Публичное/лабораторное — осознанный переход,
  // не смешивается в одном списке по умолчанию.
  // Гость по умолчанию видит "Публичное" — вкладка "Личное" для него
  // и вовсе скрыта (см. VisibilityTabs isGuest), дефолт "private" был бы
  // тупиком: пустой список без объяснения, почему он пуст.
  const [activeVisibility, setActiveVisibility] = useState<VisibilityValue>(user ? "private" : "public")
  const [activeLabId, setActiveLabId] = useState<number | null>(null)
  const [tab, setTab] = useState<"detail" | "observations" | "predictions" | "worldview" | "tasks" | "relations" | "sources" | "images">(
    (searchParams.get("tab") as any) ?? "detail"
  )

  const { selectEntity, clearSelection } = useEntityUrlSync(data, selected, setSelected, (idOrSlug) => hypApi.get(idOrSlug), isMobile, () => filtered)
  const selectHyp = (h: any) => {
    setTab("detail")
    selectEntity(h)
  }

  const changeTab = (t: string) => {
    setTab(t as any)
    const p = new URLSearchParams(searchParams.toString())
    p.set("tab", t)
    router.replace(`?${p.toString()}`)
  }


  // sync selected с актуальными данными
  useEffect(() => {
    if (selected && data.length > 0) {
      const fresh = data.find((h: any) => h.id === selected.id)
      if (fresh) setSelected(fresh)
    }
  }, [data])

  const activeStatuses = Object.keys(statusFilter).filter(k => statusFilter[k])
  // Счётчики на табах видимости считаются ДО применения самого таба (но
  // после поиска/статуса) — иначе цифра "24" в "Личное" не менялась бы,
  // даже когда пользователь ищет что-то конкретное.
  const preVisibility = data.filter((h: any) => {
    if (search.trim()) {
      const q = search.toLowerCase()
      const matchesText = h.name.toLowerCase().includes(q) || h.tags?.some((t: string) => t.toLowerCase().includes(q))
      if (!matchesText) return false
    }
    if (activeStatuses.length > 0 && !activeStatuses.includes(h.status)) return false
    return true
  })
  const visibilityCounts = {
    private: preVisibility.filter((h: any) => matchesVisibilityFilter(h, ["private"])).length,
    lab: preVisibility.filter((h: any) => matchesVisibilityFilter(h, ["lab"])).length,
    public: preVisibility.filter((h: any) => matchesVisibilityFilter(h, ["public"])).length,
  }
  const filtered = preVisibility.filter((h: any) => {
    if (!matchesVisibilityFilter(h, [activeVisibility])) return false
    if (activeLabId && h.lab_id !== activeLabId) return false
    return true
  })
  const { page: pageSafe, setPage, pageCount, paged, pageSize: PAGE_SIZE } = usePagination(filtered)
  const listTr = useListContentTranslation("hypothesis", paged, ["name"], (h: any) => isOwner(user, h))

  const errorText = useMutationErrorText()
  const notifyPartial = usePartialCreateNotice()
  // createHypothesisFull: запись -> связи -> галерея -> inline-картинки. Падает только создание самой записи;
  // провал поздних шагов не оставляет форму открытой (повторное сохранение создало бы дубль), а показывается.
  const create = useMutation({
    mutationFn: createHypothesisFull,
    onSuccess: (newH: any) => {
      notifyPartial(newH)
      qc.invalidateQueries({ queryKey: ["hypotheses"] }); setModal(null); setSelected(newH)
    },
  })
  const update = useMutation({
    // HypForm отдаёт { data, links, images, pendingFiles } (как все формы, см. lib/entity-submit.ts); при правке
    // связи и картинки создаются общим хелпером, pendingFiles пуст (id уже известен).
    mutationFn: ({ id, d, links, images }: any) =>
      updateEntityWithLinks("hypothesis", id, hypApi.update, d, links, images),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["hypotheses"] }); setModal(null) },
  })
  const closeModal = () => { setModal(null); create.reset(); update.reset() }
  const remove = useMutation({
    mutationFn: hypApi.delete,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["hypotheses"] }); setSelected(null) },
  })



  return (
    <PageShell>
      <Header
        titleKey="page.hypotheses.title"
        color={ACCENT}
        icon={<Lightbulb size={16} style={{ color: ACCENT }} />}
        actions={
          user ? (
            <Button variant="primary" size="sm" onClick={() => setModal("create")}
              style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Plus size={13} /> {t("actions.createHypothesisAction")}
            </Button>
          ) : undefined
        }
      />

      <PageContent overflow="visible" noPadding>
        <div style={SPLIT_BODY_STYLE}>
        <ResizableLayout
          showRight={!!selected}
          onBack={() => setSelected(null)}
          accent={ACCENT}
          backLabel={t("hypotheses.backLabel")}
          left={(<div style={{ width: "100%", height: "100%", ...listPanel() }}>
            {/* шапка: счётчик + пагинация */}
            <PaginationBar total={filtered.length} page={pageSafe} pageSize={PAGE_SIZE} pageCount={pageCount} onPageChange={setPage} />

            {/* поиск */}
            <div style={sectionSearchWrap()}>
              <Search size={12} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "#9696a7", pointerEvents: "none" }} />
              <input
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(0) }}
                placeholder={t("hypotheses.searchPlaceholder")}
                style={sectionSearch(ACCENT)}
                onFocus={e => (e.target as HTMLInputElement).style.borderColor = `${ACCENT}40`}
                onBlur={e => (e.target as HTMLInputElement).style.borderColor = "#1e1e2a"}
              />
            </div>

            {/* видимость — главная ось навигации, всегда видима */}
            <VisibilityTabs
              active={activeVisibility}
                  isGuest={!user}
              onChange={v => { setActiveVisibility(v); setPage(0); clearSelection() }}
              counts={visibilityCounts}
              labs={labs}
              activeLabId={activeLabId}
              onLabChange={id => { setActiveLabId(id); setPage(0) }}
            />
            {/* фильтры — второстепенное (статус) */}
            <ListFilters
              statuses={HYPOTHESIS_STATUSES}
              activeStatuses={statusFilter}
              onToggleStatus={s => { setStatusFilter(p => ({ ...p, [s]: !p[s] })); setPage(0) }}
              accent={ACCENT}
              showVisibility={false}
            />

            {/* items */}
            <div style={{ overflowY: "auto", flex: 1, minHeight: 0 }}>
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <div key={i} style={{ height: 64, borderBottom: "1px solid #111", opacity: 0.5 - i * 0.08, padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ height: 10, width: "70%", borderRadius: 4, background: "#111" }} />
                    <div style={{ height: 8, width: "40%", borderRadius: 4, background: "#0d0d0d" }} />
                  </div>
                ))
              ) : filtered.length === 0 ? (
                <div style={{ padding: "32px 16px", textAlign: "center", color: "#9999a1", fontSize: 13 }}>
                  {search || activeStatuses.length > 0 ? t("hypotheses.emptyFiltered") : t("hypotheses.emptyNone")}
                </div>
              ) : paged.map((h: any) => {
                const isActive = selected?.id === h.id
                const matColor = getMaturity(t)[h.maturity ?? 0]?.color ?? ACCENT
                return (
                  <EntityListItem
                    key={h.id}
                    id={h.id}
                    isActive={isActive}
                    accent={ACCENT}
                    onClick={() => selectHyp(h)}
                    date={h.created_at}
                    title={listTr(h, "name", h.name)}
                    status={h.status}
                    progressBar={
                      <Ruler name={t("hypotheses.maturityLabel")} value={h.maturity} min={0} max={4} levels={MATURITY_SCALE.levels} color={matColor} />
                    }
                    onEdit={isOwner(user, h) ? () => setModal(h) : undefined}
                    onDelete={isOwner(user, h) ? () => remove.mutate(h.id) : undefined}
                    deleteConfirmText={buildTrashConfirmText(t, "hypothesis", h)}
                  />
                )
              })}
            </div>
          </div>)}
          right={selected ? (
            <DetailPanel accent={ACCENT} noTopBorder>
              <HypDetail
                hyp={selected}
                labs={labs}
                onEdit={() => setModal(selected)}
                tab={tab}
                setTab={changeTab}
              />
            </DetailPanel>
          ) : (
            <DetailPanelEmpty accent={ACCENT} />
          )}
        />
        </div>
      </PageContent>

      <Modal open={!!modal} onClose={closeModal}
        title={modal === "create" ? t("hypotheses.createTitle") : t("hypotheses.editTitle")} size="lg">
        <HypForm
          initial={modal !== "create" ? modal : undefined}
          onSave={({ data, links, images, pendingFiles }: any) => modal === "create"
            ? create.mutate({ data, links, images, pendingFiles })
            : update.mutate({ id: modal.id, d: data, links, images })}
          onCancel={closeModal}
          labs={labs}
          submitting={create.isPending || update.isPending}
          error={errorText(modal === "create" ? create.error : update.error)}
        />
      </Modal>
    </PageShell>
  )
}

export default function HypothesesPage() {
  return (
    <React.Suspense>
      <HypothesesPageInner />
    </React.Suspense>
  )
}
