"use client"
import { usePartialCreateNotice } from "@/lib/use-partial-create-notice"
import { useMutationErrorText } from "@/lib/use-mutation-error-text"
import { PredictionForm } from "@/components/entities/forms/prediction-form"
import { createPredictionFull } from "@/lib/create-prediction"
import { PREDICTION_STATUSES } from "@/lib/prediction-status"
import { Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { useEntityUrlSync } from "@/lib/use-entity-url-sync"
import { matchesVisibilityFilter } from "@/lib/entity-filters"
import { useState, useEffect, useMemo } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { predApi, hypApi } from "@/lib/api"
import { useMyLabs } from "@/lib/use-my-labs"
import { renderableHtml } from "@/lib/render-safe-html"
import { updateEntityWithLinks } from "@/lib/entity-update-with-links"
import { stripHtml } from "@/lib/strip-html"
import { Header } from "@/components/layout/header"
import { ResizableLayout, useIsMobile } from "@/components/layout/resizable-layout"
import { Button } from "@/components/ui/button"
import { Modal } from "@/components/ui/modal"
import { PageShell, PageContent, SPLIT_BODY_STYLE } from "@/components/layout/page-shell"
import { useT } from "@/lib/i18n/useT"
import { UrgencyBanner } from "@/components/entities/urgency-banner"
import { EntityCallout } from "@/components/entities/entity-callout"
import { EntityPage } from "@/components/layout/entity-page"
import { ActionButton } from "@/components/ui/action-button"
import { AuthorChip } from "@/components/entities/author-chip"
import { EntityPassport } from "@/components/entities/passport"
import { EntityKnowledge } from "@/components/entities/entity-knowledge"
import { useRelatedGroups } from "@/lib/use-related-groups"
import { resolveEntityTab, relatedTabsFor } from "@/lib/entity-tab"
import { buildTrashConfirmText } from "@/lib/trash-confirm"
import { useTranslatedField } from "@/lib/i18n/useContentT"
import { EntityQuickAddMenu } from "@/components/entities/entity-quick-add-menu"
import { ObservationsTab } from "@/components/entities/relations-panel"
import { WorldviewTab } from "@/components/entities/worldview-tab"
import { TasksTab } from "@/components/entities/tasks-tab"
import { SourcesTab } from "@/components/hypotheses/sources-tab"
import { FilesTab } from "@/components/entities/files-tab"
import { EntityHistoryTab, historyTabs } from "@/components/entities/entity-history-tab"
import { typeColor, sectionSearch, sectionSearchWrap, theme } from "@/lib/theme"
import { formatEntityStampFull } from "@/lib/theme"
import { useStore } from "@/lib/store"
import { isOwner } from "@/lib/ownership"
import { PercentBar } from "@/components/ui/percent-bar"
import { EntityListItem } from "@/components/layout/entity-list-item"
import { StatusBadge } from "@/components/ui/status-badge"
import { EntityConversation } from "@/components/entities/entity-conversation"
import { ListFilters } from "@/components/entities/list-filters"
import { VisibilityTabs } from "@/components/entities/visibility-tabs"
import { usePagination, PaginationBar } from "@/components/layout/pagination"
import { VisibilityValue } from "@/components/ui/orbit-selector"
import { Plus, Bell, AlertTriangle, Clock, CheckCircle, TrendingUp, Search, Pencil, Lightbulb } from "lucide-react"
import { format, differenceInDays } from "date-fns"
import { PredictionQueue } from "@/components/entities/prediction-queue"
import { ConfirmPredictionModal, type ConfirmPredictionTarget } from "@/components/entities/confirm-prediction-modal"
import { usePostCreateReflection } from "@/lib/use-post-create-reflection"
import { ReflectionNudge } from "@/components/entities/reflection-nudge"
import { ContradictionNudge } from "@/components/entities/contradiction-nudge"
import { RichHtml } from "@/components/entities/rich-html"
import { EditFactorsModal } from "@/components/entities/edit-factors-modal"
import { EditFactorsButton } from "@/components/entities/edit-factors-button"
import { EmptyState } from "@/components/dashboard/primitives"
import { OnboardingBadge } from "@/components/ui/onboarding-badge"


// ── Urgency helpers — общие с дашбордом и PredictionQueue ──────────────────
import { getUrgency, URGENCY_COLOR } from "@/lib/prediction-urgency"

// ── Prediction card ────────────────────────────────────────────────────────
function PredCard({ p, selected, onClick, onEdit, onDelete }: any) {
  const t = useT()
  const user = useStore(s => s.user)
  const translatedTitle = useTranslatedField("prediction", p.id, "title", p.title, isOwner(user, p))
  const translatedText = useTranslatedField("prediction", p.id, "text", p.text, isOwner(user, p))
  const urg = getUrgency(p)
  const urgColor = URGENCY_COLOR[urg]
  const daysLeft = p.expected_check_date
    ? differenceInDays(new Date(p.expected_check_date), new Date())
    : null
  const deadline = p.expected_check_date ? (
    <span style={{ fontSize: 11, color: urgColor, fontFamily: "monospace", fontWeight: urg !== "ok" ? 600 : 400 }}>
      {urg === "overdue"
        ? (Math.abs(daysLeft!) === 0 ? t("predictions.dueToday") : t("predictions.listOverdue", { n: Math.abs(daysLeft!) }))
        : urg === "soon"
        ? t("predictions.listSoon", { n: daysLeft! })
        : t("predictions.listUntil", { date: format(new Date(p.expected_check_date), "dd.MM.yyyy") })}
    </span>
  ) : undefined
  return (
    <EntityListItem
      id={p.id}
      isActive={selected}
      accent={typeColor.prediction}
      onClick={onClick}
      date={p.created_at}
      title={translatedTitle || stripHtml(translatedText ?? "")}
      status={p.status}
      statusExtra={deadline}
      rightIcon={p.is_onboarding ? <OnboardingBadge /> : undefined}
      onEdit={onEdit ? () => onEdit(p) : undefined}
      onDelete={onDelete ? () => onDelete(p) : undefined}
      progressBar={p.confidence != null ? <PercentBar label={t("predictions.confidenceLabel")} value={p.confidence} color="#4dcfa6" /> : undefined}
      deleteConfirmText={buildTrashConfirmText(t, "prediction", p)}
    />
  )
}


// ── Detail panel ───────────────────────────────────────────────────────────
function DetailPanel({ p, accent, onEdit, onResolve, initialTab }: { p: any; accent: string; onEdit?: () => void; onResolve?: (p: any) => void; initialTab?: string }) {
  const t = useT()
  const user = useStore(s => s.user)
  const locale = useStore(s => s.locale)
  const qc = useQueryClient()
  const [tab, setTab] = useState(resolveEntityTab(initialTab))
  const [editFactorsId, setEditFactorsId] = useState<number | null>(null)
  const owner = isOwner(user, p)
  const { counts } = useRelatedGroups("prediction", p.id)
  const translatedTitle = useTranslatedField("prediction", p.id, "title", p.title, isOwner(user, p))
  const translatedText = useTranslatedField("prediction", p.id, "text", p.text, isOwner(user, p))
  const updateScale = useMutation({
    mutationFn: (patch: Record<string, number | null>) =>
      predApi.update(p.id, {
        title: p.title, text: p.text, date_created: p.date_created,
        expected_check_date: p.expected_check_date, hypothesis_id: p.hypothesis_id,
        status: p.status, result_notes: p.result_notes, ...patch,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["predictions"] }),
  })
  const urg = getUrgency(p)
  const daysLeft = p.expected_check_date
    ? differenceInDays(new Date(p.expected_check_date), new Date())
    : null


  const canResolve = owner && p.status === "не проверен" && !!onResolve
  const canEditFactors = owner && p.status === "не проверен"
  const entityName = p.title || stripHtml(p.text ?? "").slice(0, 80) || ""
  const overdueDays = Math.abs(daysLeft ?? 0)
  const resolveAction = canResolve
    ? { label: t("predictions.resolveButton"), icon: <CheckCircle size={14} />, onClick: () => onResolve?.(p) }
    : undefined
  const urgBanner = urg === "overdue" ? (
    <UrgencyBanner
      tone="#E74C3C" icon={<AlertTriangle size={15} />}
      title={overdueDays === 0 ? t("predictions.dueToday") : t("predictions.overdueBanner", { n: overdueDays })}
      description={canResolve ? t("predictions.overdueHint") : undefined}
      action={resolveAction && { ...resolveAction, primary: true }}
    />
  ) : urg === "soon" ? (
    <UrgencyBanner tone="#F5A623" icon={<Clock size={15} />} title={t("predictions.soonBanner", { n: daysLeft ?? 0 })} action={resolveAction} />
  ) : urg === "done" ? (
    <UrgencyBanner tone="#27AE60" icon={<CheckCircle size={15} />} title={t("predictions.doneBanner")} />
  ) : null

  return (
    <EntityPage
      accent={accent}
      icon={<TrendingUp size={14} />}
      kicker={t("predictions.kicker")}
      dateStr={formatEntityStampFull(p.created_at ?? p.date_created, locale)}
      title={translatedTitle || stripHtml(translatedText ?? "")}
      actions={
        <>
          {owner && onEdit && (
            <ActionButton variant="primary" accent={accent} icon={<Pencil size={14} />} onClick={onEdit}>
              {t("actions.edit")}
            </ActionButton>
          )}
          {canResolve && (
            <ActionButton accent={accent} icon={<CheckCircle size={14} />} onClick={() => onResolve?.(p)}>
              {t("predictions.resolveButton")}
            </ActionButton>
          )}
          {user && <EntityQuickAddMenu entityType="prediction" entityId={p.id} entityName={entityName} />}
          {canEditFactors && <EditFactorsButton onClick={() => setEditFactorsId(p.id)} />}
        </>
      }
      insights={
        <>
          {urgBanner}
          <ReflectionNudge entityType="prediction" entityId={p.id} accent={accent} />
          <ContradictionNudge entityType="prediction" entityId={p.id} text={stripHtml(p.text ?? "")} accent={accent} isOwner={owner} />
        </>
      }
      passport={compact => (
        <EntityPassport
          entityType="prediction"
          entityId={p.id}
          values={p}
          onSave={patch => updateScale.mutate(patch)}
          isPending={updateScale.isPending}
          isOwner={owner}
          accent={accent}
          compact={compact}
          meta={[
            { label: t("passport.status"), node: <StatusBadge status={p.status} fontSize={12} /> },
            ...((p.owner_display_name || p.owner_username) ? [{ label: t("passport.author"), node: <AuthorChip name={p.owner_display_name || p.owner_username} username={p.owner_username} /> }] : []),
          ]}
        />
      )}
      tabs={[
        { id: "detail",       label: t("tabs.detail")      },
        { id: "observations", label: t("tabs.observations"), count: counts.observation },
        { id: "worldview",    label: t("tabs.worldview"),    count: counts.worldview },
        { id: "tasks",        label: t("tabs.tasks"),        count: counts.task },
        { id: "sources",      label: t("tabs.sources")     },
        { id: "images",       label: t("tabs.files")       },
        ...historyTabs(t, owner),
      ]}
      activeTab={tab}
      onTabChange={id => setTab(id)}
      scrollKey={p.id}
    >
      <EditFactorsModal entityType="prediction" entityId={editFactorsId} onClose={() => setEditFactorsId(null)} />
      {tab === "detail" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 28, minWidth: 0 }}>
          {p.hyp_name && (
            <EntityCallout tone={typeColor.hypothesis} icon={<Lightbulb size={15} />} title={t("predictions.hypothesisRefLabel")} href={p.hypothesis_id ? `/hypotheses?id=${p.hypothesis_id}&tab=detail` : undefined}>
              {p.hyp_name}
            </EntityCallout>
          )}
          {p.text && (
            <>
              <RichHtml html={renderableHtml(translatedText)} accent={accent} className="pred-body-html"
                style={{ fontSize: 15, color: p.title ? "#9b9b9b" : "#c0c0d8", lineHeight: 1.7, maxWidth: 760 }} />
            </>
          )}
          {p.result_notes && (
            <EntityCallout tone={accent} icon={<CheckCircle size={15} />} title={t("predictions.resultNotesLabel")}>
              <p style={{ margin: 0 }}>{p.result_notes}</p>
            </EntityCallout>
          )}
          <EntityKnowledge
            entityType="prediction" entityId={p.id} entityTitle={entityName} accent={accent}
            addAction={user ? <EntityQuickAddMenu entityType="prediction" entityId={p.id} entityName={entityName} /> : undefined}
            tabForType={relatedTabsFor("prediction")}
            onOpenTab={setTab}
          />
          <div style={{ borderTop: `1px solid ${theme.ln1}`, paddingTop: 24, minWidth: 0 }}>
            <EntityConversation entityType="prediction" entity={p} accent={accent} />
          </div>
        </div>
      )}
      {tab === "observations" && <ObservationsTab entityType="prediction" entityId={p.id} entityName={entityName} />}
      {tab === "worldview" && <WorldviewTab entityType="prediction" entityId={p.id} entityName={entityName} />}
      {tab === "tasks" && <TasksTab entityType="prediction" entityId={p.id} entityName={entityName} />}
      {tab === "sources" && <SourcesTab entityType="prediction" entityId={p.id} entityName={entityName} canEdit={owner} />}
      {tab === "history" && <EntityHistoryTab entityType="prediction" entityId={p.id} isOwner={owner} />}
      {tab === "images" && <FilesTab entityType="prediction" entityId={p.id} isOwner={owner} />}
    </EntityPage>
  )
}

// ── Form ───────────────────────────────────────────────────────────────────

// ── Page ───────────────────────────────────────────────────────────────────
function PredictionsPageInner() {
  const t = useT()
  const user = useStore(s => s.user)
  const qc = useQueryClient()
  const { data = [], isLoading } = useQuery({ queryKey: ["predictions", "mine"], queryFn: () => predApi.list({ mine: true }) })
  const { data: hyps = [] } = useQuery({ queryKey: ["hypotheses"], queryFn: () => hypApi.list() })
  const { data: labs = [] } = useMyLabs()
  const [modal, setModal] = useState<null | "create" | any>(null)
  const [selected, setSelected] = useState<any>(null)
  const [predSearch, setPredSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<Record<string, boolean>>({})
  // Гость по умолчанию видит "Публичное" — вкладка "Личное" для него
  // и вовсе скрыта (см. VisibilityTabs isGuest), дефолт "private" был бы
  // тупиком: пустой список без объяснения, почему он пуст.
  const [activeVisibility, setActiveVisibility] = useState<VisibilityValue>(user ? "private" : "public")
  const [activeLabId, setActiveLabId] = useState<number | null>(null)
  const [showQueue, setShowQueue] = useState(false)
  const accent = typeColor.prediction

  const searchParams = useSearchParams()

  const isMobile = useIsMobile()
  const { selectEntity, clearSelection } = useEntityUrlSync(data as any[], selected, setSelected, (idOrSlug) => predApi.get(idOrSlug), isMobile, () => filtered)
  const selectPrediction = (p: any) => {
    selectEntity(p)
  }

  // синхронизируем selected со свежими данными после рефетча (например, после сохранения шкалы)
  useEffect(() => {
    if (selected && data.length > 0) {
      const fresh = (data as any[]).find((p: any) => p.id === selected.id)
      if (fresh) setSelected(fresh)
    }
  }, [data])

  // group by hypothesis
  const activeStatuses = Object.keys(statusFilter).filter(k => statusFilter[k])
  const preVisibility = useMemo(() => {
    return (data as any[]).filter((p: any) => {
      if (predSearch.trim() && !(p.title || stripHtml(p.text ?? "")).toLowerCase().includes(predSearch.toLowerCase())) return false
      if (activeStatuses.length > 0 && !activeStatuses.includes(p.status)) return false
      return true
    })
  }, [data, predSearch, statusFilter])
  const visibilityCounts = {
    private: preVisibility.filter((p: any) => matchesVisibilityFilter(p, ["private"])).length,
    lab: preVisibility.filter((p: any) => matchesVisibilityFilter(p, ["lab"])).length,
    public: preVisibility.filter((p: any) => matchesVisibilityFilter(p, ["public"])).length,
  }
  const filtered = useMemo(() => {
    return preVisibility.filter((p: any) => {
      if (!matchesVisibilityFilter(p, [activeVisibility])) return false
      if (activeLabId && p.lab_id !== activeLabId) return false
      return true
    })
  }, [preVisibility, activeVisibility, activeLabId])
  const { page, setPage, pageCount, paged, pageSize } = usePagination(filtered)

  const overdueCnt = (data as any[]).filter((p: any) => getUrgency(p) === "overdue").length
  const soonCnt    = (data as any[]).filter((p: any) => getUrgency(p) === "soon").length

  const { show: showPostCreateReflection, modalNode: postCreateReflectionNode } = usePostCreateReflection("prediction")
  const errorText = useMutationErrorText()
  const notifyPartial = usePartialCreateNotice()
  const create = useMutation({
    mutationFn: createPredictionFull,
    onSuccess: async (newP: any) => {
      notifyPartial(newP)
      qc.invalidateQueries({ queryKey: ["predictions"] }); setModal(null)
      showPostCreateReflection({ id: newP.id })
    },
  })
  const update = useMutation({
    // PredictionForm отдаёт { data, links, images, pendingFiles }; _pendingFiles при правке всегда пуст
    // (id уже известен, blob-deferral не срабатывает), поэтому здесь не нужен.
    mutationFn: ({ id, d, links, images }: any) =>
      updateEntityWithLinks("prediction", id, predApi.update, d, links, images),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["predictions"] })
      qc.invalidateQueries({ queryKey: ["related"] })
      setModal(null)
    },
  })
  const remove = useMutation({ mutationFn: predApi.delete, onSuccess: () => { qc.invalidateQueries({ queryKey: ["predictions"] }); if (selected?.id === modal?.id) setSelected(null) } })
  const [confirmTarget, setConfirmTarget] = useState<ConfirmPredictionTarget | null>(null)
  const close = useMutation({
    mutationFn: ({ id, status, result_notes }: { id: number; status: string; result_notes: string }) =>
      predApi.close(id, status, result_notes),
    // Модалка теперь сама решает, когда закрыться (после опционального шага
    // рефлексии/инсайта) — поэтому setConfirmTarget(null) здесь больше нет.
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["predictions"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }) },
  })

  return (
    <PageShell>
      <Header titleKey="page.predictions.title" color="#F5A623" icon={<TrendingUp size={16} style={{ color: "#F5A623" }} />} actions={
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {(overdueCnt + soonCnt) > 0 && (
            <div onClick={() => setShowQueue(v => !v)}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 7, cursor: "pointer",
                background: showQueue ? (overdueCnt > 0 ? "#E74C3C" : "#F5A623") : (overdueCnt > 0 ? "#E74C3C12" : "#F5A62312"),
                border: `1px solid ${overdueCnt > 0 ? "#E74C3C30" : "#F5A62330"}`, transition: "background 0.12s" }}>
              <Bell size={12} style={{ color: showQueue ? "#0b0d14" : (overdueCnt > 0 ? "#E74C3C" : "#F5A623") }} />
              <span style={{ fontSize: 12, color: showQueue ? "#0b0d14" : (overdueCnt > 0 ? "#E74C3C" : "#F5A623"), fontWeight: 600 }}>
                {overdueCnt > 0 ? `${overdueCnt} просрочен` : `${soonCnt} скоро`}
              </span>
            </div>
          )}
          {user && (
            <Button variant="primary" size="sm" onClick={() => setModal("create")} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Plus size={13} /> {t("actions.createPredictionAction")}
            </Button>
          )}
        </div>
      } />

      <PageContent overflow="visible" noPadding>
        <Modal open={showQueue} onClose={() => setShowQueue(false)} title={t("predictions.queueTitle")} size="xl">
          <PredictionQueue
            items={(data as any[]).filter(p => ["overdue", "soon"].includes(getUrgency(p)))}
            invalidateKeys={[["predictions"], ["dashboard"]]}
            showHeader={false}
            bordered={false}
            onNavigate={() => setShowQueue(false)}
          />
        </Modal>
        <div style={SPLIT_BODY_STYLE}>
        {isLoading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {[...Array(5)].map((_, i) => <div key={i} style={{ height: 56, borderRadius: 10, background: "#111", border: "1px solid #1a1a1a", opacity: 0.5 - i * 0.08 }} />)}
          </div>
        ) : (
          <ResizableLayout
            accent={accent}
            backLabel={t("predictions.backLabel")}
            showRight={!!selected}
            onBack={() => setSelected(null)}
            left={
              <div style={{ background: theme.bg1, overflow: "hidden", display: "flex", flexDirection: "column", height: "100%" }}>
                <PaginationBar total={filtered.length} page={page} pageSize={pageSize} pageCount={pageCount} onPageChange={setPage} />
                <div style={sectionSearchWrap()}>
                  <Search size={13} style={{ position: "absolute", left: 22, top: "50%", transform: "translateY(-50%)", color: "#848cb0", pointerEvents: "none" }} />
                  <input value={predSearch} onChange={e => { setPredSearch(e.target.value); setPage(0) }}
                    placeholder={t("predictions.searchPlaceholder")}
                    style={sectionSearch(accent)}
                    onFocus={e => (e.target as HTMLInputElement).style.borderColor = `${accent}40`}
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
                  statuses={PREDICTION_STATUSES}
                  activeStatuses={statusFilter}
                  onToggleStatus={s => { setStatusFilter(p => ({ ...p, [s]: !p[s] })); setPage(0) }}
                  accent={accent}
                  showVisibility={false}
                />
                <div style={{ overflowY: "auto", flex: 1, minHeight: 0 }}>
                  {paged.length === 0 ? (
                    <EmptyState
                      icon={<TrendingUp size={15} />}
                      title={predSearch.trim() || activeStatuses.length > 0 || activeVisibility !== "private" || activeLabId
                        ? t("predictions.emptyFilteredTitle")
                        : t("predictions.emptyTitle")}
                      body={predSearch.trim() || activeStatuses.length > 0 || activeVisibility !== "private" || activeLabId
                        ? t("predictions.emptyFilteredBody")
                        : t("predictions.emptyBody")}
                      actionLabel={!(predSearch.trim() || activeStatuses.length > 0 || activeVisibility !== "private" || activeLabId) ? t("actions.addPrediction") : undefined}
                      onAction={!(predSearch.trim() || activeStatuses.length > 0 || activeVisibility !== "private" || activeLabId) ? () => setModal("create") : undefined}
                    />
                  ) : (
                    paged.map((p: any) => (
                      <PredCard key={p.id} p={p}
                        selected={selected?.id === p.id}
                        onClick={() => selectPrediction(p)}
                        onEdit={isOwner(user, p) ? () => setModal(p) : undefined}
                        onDelete={isOwner(user, p) ? () => remove.mutate(p.id) : undefined}
                      />
                    ))
                  )}
                </div>
              </div>
            }
            right={
              selected ? (
                <DetailPanel key={selected?.id} p={selected} accent={accent} onEdit={() => setModal(selected)} onResolve={(p) => setConfirmTarget(p)} initialTab={searchParams.get("tab") ?? "detail"} />
              ) : (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", color: "#999999", fontSize: 13, background: theme.bg0, flex: 1, minWidth: 0, height: "100%" }}>
                  {t("predictions.selectPrompt")}
                </div>
              )
            }
          />
        )}
        </div>
      </PageContent>

      <Modal open={!!modal} onClose={() => { setModal(null); create.reset(); update.reset() }} title={modal === "create" ? t("predictions.createTitle") : t("predictions.editTitle")} size="lg">
        <PredictionForm initial={modal !== "create" ? modal : undefined} hyps={hyps} labs={labs}
          onSave={({ data, links, images, pendingFiles }) => modal === "create"
            ? create.mutate({ data, links, images, pendingFiles })
            : update.mutate({ id: modal.id, d: data, links, images })}
          onCancel={() => { setModal(null); create.reset(); update.reset() }}
          submitting={create.isPending || update.isPending}
          error={errorText(modal === "create" ? create.error : update.error)} />
      </Modal>

      <ConfirmPredictionModal
        target={confirmTarget}
        onClose={() => setConfirmTarget(null)}
        onSave={(status, result_notes) => close.mutateAsync({ id: confirmTarget!.id, status, result_notes })}
      />

      {postCreateReflectionNode}
    </PageShell>
  )
}

export default function PredictionsPage() {
  return (
    <Suspense>
      <PredictionsPageInner />
    </Suspense>
  )
}
