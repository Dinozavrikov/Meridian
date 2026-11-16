"use client"
import { labKeys, invalidateLabMembership } from "@/lib/lab-queries"
import { useState, type CSSProperties } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useParams, useRouter } from "next/navigation"
import { Header } from "@/components/layout/header"
import { PageShell, PageContent } from "@/components/layout/page-shell"
import { api, taskApi, questionApi, hypApi } from "@/lib/api"
import { useTranslatedEntityQuery, useTranslatedListQuery } from "@/lib/i18n/use-translated-query"
import { FlaskConical, Globe, Lock, LogIn, LogOut, Check, X as XIcon, ArrowLeft } from "lucide-react"
import Link from "next/link"
import { v2, typeColor, tag, theme } from "@/lib/theme"
import { DEFAULT_SCALES } from "@/lib/scales"
import { SourcesTab } from "@/components/hypotheses/sources-tab"
import { LabHypothesesRail } from "@/components/labs/lab-hypotheses-rail"
import { LabResultsTab } from "@/components/labs/lab-results-tab"
import { LabCompareTab } from "@/components/labs/lab-compare-tab"
import { HypothesisPreviewModal } from "@/components/labs/hypothesis-preview-modal"
import { TabBadge } from "@/components/labs/tab-badge"
import { LabObservationsTab } from "@/components/labs/lab-observations-tab"
import { LabHypothesesTab } from "@/components/labs/lab-hypotheses-tab"
import { LabMembersTab } from "@/components/labs/lab-members-tab"
import { LabPredictionsTab } from "@/components/labs/lab-predictions-tab"
import { LabGraphTab } from "@/components/labs/lab-graph-tab"
import { LabSignalTab } from "@/components/labs/lab-signal-tab"
import { LabFeedTab } from "@/components/labs/lab-feed-tab"
import { LabCheckpointsTab } from "@/components/labs/lab-checkpoints-tab"
import { LabFilesTab } from "@/components/labs/lab-files-tab"
import { useT } from "@/lib/i18n/useT"
import { roleLabel } from "@/lib/lab-roles"
import { StageBadge } from "@/components/entities/stage-badge"
import { ruPluralForm } from "@/lib/i18n/ru-plural"

export default function LabPage() {
  const t = useT()
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const qc = useQueryClient()
  const [activeTab, setActiveTab] = useState("overview")
  const [includeOpened, setIncludeOpened] = useState(false)
  const [focusedHypId, setFocusedHypId] = useState<number | null>(null)
  const [previewHypId, setPreviewHypId] = useState<number | null>(null)

  // Единственный автор name/description лабы — owner_id (у лабы нет
  // эндпоинта редактирования этих полей, см. backend/app/api/v1/labs.py:
  // только create_lab их задаёт). Роль ("member"/"admin") тут не годится —
  // я могу состоять в чужой лабе, не будучи её владельцем.
  const { data: lab, isLoading: labLoading } = useTranslatedEntityQuery(
    labKeys.card(id),
    () => api.get(`/api/v1/labs/${id}`).then(r => r.data),
    "lab",
    ["name", "description"],
    { ownerField: "owner_id" },
  )

  // Подзапросы лаборатории ключуются ЧИСЛОВЫМ id (см. labKeys); 0 — пока лаборатория не загружена
  // (эти запросы выключены через enabled).
  const keyId = lab?.id ?? 0
  const goalColor = lab?.goal_type === "task" ? typeColor.task : typeColor.question
  const isMember = !!lab?.role
  const isOwner_ = lab?.role === "owner"
  const isAdmin  = lab?.role === "admin"
  const canEdit  = isOwner_ || isAdmin
  const canAddForecast = isMember || !!lab?.is_public

  const { data: goalTask } = useTranslatedEntityQuery(
    labKeys.goalTask(keyId),
    () => taskApi.get(lab.goal_id),
    "task",
    ["name", "description"],
    { enabled: !!lab && lab.goal_type === "task" },
  )
  const { data: goalQuestion } = useTranslatedEntityQuery(
    labKeys.goalQuestion(keyId),
    () => questionApi.get(lab.goal_id),
    "question",
    ["title", "text"],
    { enabled: !!lab && lab.goal_type === "question" },
  )
  const goalEntity = lab?.goal_type === "task" ? goalTask : goalQuestion
  const goalTitle = goalTask?.name ?? goalQuestion?.title ?? ""
  const goalText = goalTask?.description ?? goalQuestion?.text ?? ""

  const { data: allHyps = [] } = useTranslatedListQuery(
    ["hypotheses"],
    () => hypApi.list(),
    "hypothesis",
    ["name", "description"],
    { enabled: !!lab },
  )
  const previewHyp = allHyps.find((h: any) => h.id === previewHypId) ?? null
  const { data: linkedHyps = [] } = useQuery({
    queryKey: [lab?.goal_type, "hyps", lab?.goal_id],
    queryFn: () => api.get(`/api/v1/${lab.goal_type}s/${lab.goal_id}/hypotheses`).then(r => r.data),
    enabled: !!lab && !!lab.goal_type && !!lab.goal_id,
  })
  const linkedHypIds = new Set<number>(linkedHyps.map((h: any) => h.id))

  // Сообщение заявки всегда пишет проситель, читает owner/admin — это
  // никогда не мой текст (я бы не подавал заявку в свою же лабу). Дефолтное
  // поле владельца ("user_id") у LabJoinRequest как раз то, что нужно.
  const { data: requests = [] } = useTranslatedListQuery(
    labKeys.requests(keyId),
    () => api.get(`/api/v1/labs/${id}/requests`).then(r => r.data),
    "lab_join_request",
    ["message"],
    { enabled: !!lab && canEdit },
  )
  const [declining, setDeclining] = useState<number | null>(null)
  const [declineReason, setDeclineReason] = useState("")

  const acceptReq = useMutation({
    mutationFn: (reqId: number) => api.post(`/api/v1/labs/${id}/requests/${reqId}/accept`),
    onSuccess: () => { invalidateLabMembership(qc, keyId) },
  })
  const declineReq = useMutation({
    mutationFn: ({ reqId, reason }: { reqId: number; reason: string }) =>
      api.post(`/api/v1/labs/${id}/requests/${reqId}/decline`, { reason }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: labKeys.requests(keyId) }); setDeclining(null); setDeclineReason("") },
  })

  const [joinMsg, setJoinMsg] = useState("")
  const [showJoinForm, setShowJoinForm] = useState(false)
  const joinReq = useMutation({
    mutationFn: () => api.post(`/api/v1/labs/${id}/join-request`, { message: joinMsg }).then(r => r.data),
    onSuccess: () => {
      invalidateLabMembership(qc, keyId)
      setShowJoinForm(false)
    },
  })
  const leaveMut = useMutation({
    mutationFn: () => api.delete(`/api/v1/labs/${id}/leave`).then(r => r.data),
    onSuccess: () => { invalidateLabMembership(qc, keyId); router.push("/labs") },
  })

  if (labLoading) return (
    <PageShell>
      <Header titleKey="page.lab.title" />
      <PageContent>
        <div className="flex flex-col gap-4">
          {[...Array(3)].map((_, i) => <div key={i} className="bg-[#111420] border border-[#1E2236] rounded-xl h-24 animate-pulse" />)}
        </div>
      </PageContent>
    </PageShell>
  )

  if (!lab) return (
    <PageShell>
      <Header titleKey="page.lab.title" />
      <PageContent>
        <div className="text-center text-[#505050] py-12">{t("labsPage.notFound")}</div>
      </PageContent>
    </PageShell>
  )

  const pendingCount = requests.length
  const labId = lab.id as number
  const memberForm = ruPluralForm(lab.member_count)
  const memberKey = memberForm === "one" ? "labsPage.memberOne" : memberForm === "few" ? "labsPage.memberFew" : "labsPage.memberMany"

  const TABS = [
    { id: "overview", label: t("labTabs.overview") },
    { id: "observations", label: t("nav.data.observations"), badge: <TabBadge n={lab.observations_count} extra={includeOpened ? lab.observations_opened_count : undefined} /> },
    { id: "predictions", label: t("nav.data.predictions"), badge: <TabBadge n={lab.predictions_count} extra={includeOpened ? lab.predictions_opened_count : undefined} /> },
    { id: "feed", label: t("labTabs.feed") },
    { id: "graph", label: t("nav.analysis.graph") },
    ...(isMember ? [{ id: "signal", label: t("labTabs.signal") }] : []),
    { id: "sources", label: t("tabs.sources") },
    { id: "lab-members", label: t("labTabs.members"), badge: <TabBadge n={lab.member_count} /> },
    ...(isMember ? [{ id: "files", label: t("labTabs.files") }] : []),
    ...(isMember ? [{ id: "checkpoints", label: t("labTabs.checkpoints") }] : []),
    ...(canEdit ? [{ id: "lab-requests", label: t("labTabs.requests"), badge: <TabBadge n={pendingCount} warn /> }] : []),
  ]

  const stats: { id: string; label: string; value: number; tab?: string }[] = [
    { id: "hyps", label: t("tabs.hypotheses"), value: linkedHyps.length },
    { id: "obs", label: t("nav.data.observations"), value: lab.observations_count ?? 0, tab: "observations" },
    { id: "pred", label: t("nav.data.predictions"), value: lab.predictions_count ?? 0, tab: "predictions" },
    { id: "res", label: t("labTabs.resultsTab"), value: lab.results_count ?? 0 },
    { id: "mem", label: t("labTabs.members"), value: lab.member_count ?? 0, tab: "lab-members" },
  ]
  // Отступы Tailwind в проекте не работают (глобальный сброс padding без слоя) — здесь только инлайн-стили.
  const btnBase: CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8,
    fontSize: 12, fontWeight: 500, cursor: "pointer",
  }

  return (
    <PageShell>
      <Header title={lab.name} />
      <PageContent>

        <Link href="/labs" className="flex items-center gap-1.5 text-xs text-[#606060] hover:text-[#909090] transition-colors w-full" style={{ marginBottom: 20 }}>
          <ArrowLeft size={13} /> {t("labsPage.backToLabs")}
        </Link>

        <div style={{
          width: "100%", marginBottom: 24, borderRadius: 16, padding: "20px 24px",
          background: `linear-gradient(135deg, ${goalColor}12 0%, ${v2.surf} 60%)`,
          border: `1px solid ${v2.bd}`, borderLeft: `3px solid ${goalColor}`,
          display: "flex", flexWrap: "wrap", alignItems: "center", gap: "14px 16px",
        }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: `${goalColor}1c`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <FlaskConical size={20} style={{ color: goalColor }} />
          </div>
          <div style={{ flex: "1 1 260px", minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            <h1 style={{ fontSize: 20, fontWeight: 600, lineHeight: 1.25, color: v2.t1, letterSpacing: "-0.015em", overflowWrap: "anywhere" }}>{lab.name}</h1>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
              <span style={{ ...tag(lab.is_public ? v2.teal : v2.t3), display: "inline-flex", alignItems: "center", gap: 4 }}>
                {lab.is_public ? <Globe size={9} /> : <Lock size={9} />}
                {lab.is_public ? t("labsPage.isPublicBadge") : t("labsPage.isPrivateBadge")}
              </span>
              <StageBadge entityType="lab" entityId={lab.id} isOwner={isOwner_ || isAdmin} accent={theme.accent} />
              <span style={{ fontSize: 12, color: v2.t3 }}>
                {t(memberKey, { n: lab.member_count })}
                {isMember && <> · {roleLabel(t, lab.role)}</>}
              </span>
            </div>
          </div>

          {!isMember && !showJoinForm && (
            <button onClick={() => setShowJoinForm(true)}
              style={{ ...btnBase, background: `${theme.accent}14`, color: theme.accent, border: `1px solid ${theme.accent}28` }}>
              <LogIn size={13} /> {t("labsPage.joinButton")}
            </button>
          )}
          {isMember && !isOwner_ && (
            <button onClick={() => leaveMut.mutate()} disabled={leaveMut.isPending}
              style={{ ...btnBase, background: "#E74C3C14", color: "#E74C3C", border: "1px solid #E74C3C28", opacity: leaveMut.isPending ? 0.5 : 1 }}>
              <LogOut size={13} /> {t("labsPage.leaveButton")}
            </button>
          )}
          {!isMember && showJoinForm && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, width: "100%" }}>
              <input value={joinMsg} onChange={e => setJoinMsg(e.target.value)}
                placeholder={t("labsPage.joinPlaceholder")}
                style={{ flex: 1, minWidth: 0, background: v2.bg, border: `1px solid ${v2.bd2}`, color: v2.t1, borderRadius: 8, padding: "8px 12px", fontSize: 13 }} />
              <button onClick={() => joinReq.mutate()} disabled={joinReq.isPending}
                style={{ ...btnBase, background: theme.accent, color: "#fff", border: "none", opacity: joinReq.isPending ? 0.5 : 1 }}>
                {t("labsPage.sendJoinButton")}
              </button>
            </div>
          )}
        </div>

        <div className="w-full flex flex-col md:flex-row gap-5">
          {goalEntity && (
            <div className="w-full md:w-[300px] flex-shrink-0 self-start md:sticky md:top-5"
              style={{ background: v2.surf, border: `1px solid ${v2.bd}`, borderRadius: 14, padding: 16 }}>
              <LabHypothesesRail parentType={lab.goal_type} parentId={lab.goal_id} allHyps={allHyps}
                focusedId={focusedHypId} onFocus={setFocusedHypId} onPreview={setPreviewHypId} canEdit={canEdit} canAddForecast={canAddForecast} bare labId={labId} labName={lab.name} />
              <div style={{ height: 1, background: v2.bd, margin: "16px 0" }} />
              <LabHypothesesTab labId={labId} labName={lab.name} canManage={canEdit} isMember={isMember}
                goalType={lab.goal_type} goalId={lab.goal_id} linkedHypIds={linkedHypIds} bare includeOpened={includeOpened} onIncludeOpenedChange={setIncludeOpened} />
            </div>
          )}

          <div className="flex-1 min-w-0 bg-[#111420] border border-[#1E2236] rounded-xl overflow-hidden" style={{ minHeight: 500 }}>
            <div className="entity-tabs-scroll" style={{
              display: "flex", alignItems: "center", gap: 2, borderBottom: `1px solid ${v2.bd}`,
              padding: "0 12px", overflowX: "auto",
            }}>
              {TABS.map(tb => {
                const active = activeTab === tb.id
                return (
                  <button key={tb.id} onClick={() => setActiveTab(tb.id)} aria-current={active ? "page" : undefined}
                    style={{
                      display: "flex", alignItems: "center", gap: 6, padding: "13px 14px", fontSize: 13,
                      fontWeight: active ? 600 : 500, color: active ? v2.t1 : v2.t2,
                      border: "none", background: "transparent", cursor: "pointer",
                      borderBottom: `2px solid ${active ? goalColor : "transparent"}`,
                      marginBottom: -1, whiteSpace: "nowrap", flexShrink: 0,
                    }}>
                    {tb.label}{tb.badge}
                  </button>
                )
              })}
            </div>

            {activeTab === "overview" && (
              <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
                {lab.description && (
                  <p style={{ fontSize: 14, color: v2.t2, lineHeight: 1.75, margin: 0, whiteSpace: "pre-wrap", maxWidth: 820 }}>{lab.description}</p>
                )}
                {goalEntity ? (
                  <div style={{ padding: "16px 18px", borderRadius: 12, background: v2.bg, border: `1px solid ${v2.bd}`, borderLeft: `3px solid ${goalColor}` }}>
                    <div style={{ fontSize: 10, color: goalColor, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6, fontWeight: 700 }}>
                      {lab.goal_type === "task" ? t("labsPage.goalTypeTask") : t("labsPage.goalTypeQuestion")}
                    </div>
                    <div style={{ fontSize: 15, color: v2.t1, fontWeight: 600, lineHeight: 1.45, marginBottom: goalText ? 8 : 0 }}>{goalTitle}</div>
                    {goalText && <p style={{ fontSize: 13, color: v2.t2, lineHeight: 1.65, margin: 0, whiteSpace: "pre-wrap" }}>{goalText}</p>}
                  </div>
                ) : (
                  <div style={{ color: v2.t3, fontSize: 12 }}>{t("labsPage.loadingGoal")}</div>
                )}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 }}>
                  {stats.map(s => {
                    const tab = s.tab
                    const tile: CSSProperties = {
                      display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 6, textAlign: "left",
                      padding: "14px 16px", borderRadius: 12, background: v2.bg, border: `1px solid ${v2.bd}`,
                    }
                    const body = (
                      <>
                        <span style={{ fontSize: 24, fontWeight: 600, color: v2.t1, lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>{s.value}</span>
                        <span style={{ fontSize: 11, color: v2.t3, textTransform: "uppercase", letterSpacing: "0.06em" }}>{s.label}</span>
                      </>
                    )
                    return tab
                      ? <button key={s.id} type="button" onClick={() => setActiveTab(tab)} style={{ ...tile, cursor: "pointer" }}>{body}</button>
                      : <div key={s.id} style={tile}>{body}</div>
                  })}
                </div>
              </div>
            )}
            {activeTab === "observations" && <LabObservationsTab labId={labId} canEdit={isMember} includeOpened={includeOpened} onIncludeOpenedChange={setIncludeOpened} />}
            {activeTab === "predictions" && <LabPredictionsTab labId={labId} canEdit={isMember} includeOpened={includeOpened} onIncludeOpenedChange={setIncludeOpened} />}
            {activeTab === "feed" && <LabFeedTab labId={labId} labName={lab.name} />}
            {activeTab === "graph" && <LabGraphTab labId={labId} />}
            {activeTab === "signal" && isMember && <LabSignalTab labId={labId} />}
            {activeTab === "sources" && goalEntity && (
              <SourcesTab entityType={lab.goal_type} entityId={lab.goal_id} entityName={goalTitle} canEdit={isOwner_} />
            )}

            {activeTab === "lab-members" && <LabMembersTab labId={labId} isOwner={isOwner_} />}
            {activeTab === "files" && isMember && <LabFilesTab labId={labId} />}
            {activeTab === "checkpoints" && isMember && (
              <LabCheckpointsTab labId={labId} labIsPublic={!!lab.is_public} canPublish={canEdit} />
            )}

            {activeTab === "lab-requests" && canEdit && (
              <div className="p-5 flex flex-col gap-3 max-w-xl">
                {requests.length === 0 ? (
                  <div className="text-center py-12 border border-dashed border-[#242424] rounded-xl text-sm text-[#505050]">{t("labsPage.noRequestsText")}</div>
                ) : requests.map((r: any) => (
                  <div key={r.id} className="bg-[#111420] border border-[#1E2236] rounded-xl p-4">
                    <div className="flex items-center gap-2.5">
                      <a href={`/profile/${r.username}`} className="w-8 h-8 rounded-full bg-[#161928] flex items-center justify-center shrink-0 hover:opacity-80 transition-opacity">
                        <span className="text-xs font-bold text-[#707070]">{(r.display_name || r.username)[0].toUpperCase()}</span>
                      </a>
                      <div className="flex-1 min-w-0">
                        <a href={`/profile/${r.username}`} className="text-xs font-semibold text-[#c0c0c0] hover:text-[#e0e0e0] hover:underline">{r.display_name || r.username}</a>
                        <p className="text-[10px] text-[#404040]">@{r.username}</p>
                      </div>
                    </div>
                    {r.message && <div className="mt-2.5 px-3 py-2 rounded-lg bg-[#161928] text-xs text-[#909090] leading-relaxed">«{r.message}»</div>}
                    <div className="flex gap-2 mt-3">
                      <button onClick={() => acceptReq.mutate(r.id)} disabled={acceptReq.isPending}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#2ECC7118] text-[#2ECC71] text-xs font-medium hover:bg-[#2ECC7130] transition-colors disabled:opacity-50">
                        <Check size={12} /> {t("labsPage.acceptButton")}
                      </button>
                      <button onClick={() => setDeclining(declining === r.id ? null : r.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#E74C3C18] text-[#E74C3C] text-xs font-medium hover:bg-[#E74C3C30] transition-colors">
                        <XIcon size={12} /> {t("labsPage.declineButton")}
                      </button>
                    </div>
                    {declining === r.id && (
                      <div className="mt-3 pt-3 border-t border-dashed border-[#242424]">
                        <p className="text-[11px] text-[#505050] mb-1.5">{t("labsPage.declineReasonLabel")}</p>
                        <textarea value={declineReason} onChange={e => setDeclineReason(e.target.value)} rows={2}
                          placeholder={t("labsPage.declineReasonPlaceholder")}
                          className="w-full bg-[#0b0d14] border border-[#1E2236] rounded-lg px-3 py-2 text-xs text-[#e0e0e0] placeholder-[#383838] focus:outline-none focus:border-[#E74C3C] resize-none" />
                        <button onClick={() => declineReq.mutate({ reqId: r.id, reason: declineReason })} disabled={declineReq.isPending}
                          className="mt-2 px-3 py-1.5 rounded-lg bg-[#E74C3C] text-white text-xs font-medium disabled:opacity-50">
                          {t("labsPage.sendDeclineButton")}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="w-full md:w-[300px] flex-shrink-0 self-start md:sticky md:top-5"
            style={{ background: v2.surf, border: `1px solid ${v2.bd}`, borderRadius: 14, padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12, fontSize: 11, fontWeight: 700, color: v2.t2, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              {t("labTabs.resultsTab")}
              <TabBadge n={lab.results_count} />
            </div>
            <LabResultsTab labId={labId} canManage={canEdit} isMember={isMember} labIsPublic={lab.is_public} bare />
          </div>
        </div>

        <HypothesisPreviewModal hyp={previewHyp} onClose={() => setPreviewHypId(null)} />
      </PageContent>
    </PageShell>
  )
}
