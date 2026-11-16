"use client"
import { createHypothesisFull } from "@/lib/create-hypothesis"
import { usePartialCreateNotice } from "@/lib/use-partial-create-notice"
import { useMutationErrorText } from "@/lib/use-mutation-error-text"
import { invalidateLabCard } from "@/lib/lab-queries"
import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Plus, Lightbulb, Check, X as XIcon, Search, ChevronDown } from "lucide-react"
import { hypApi, api } from "@/lib/api"
import { useTranslatedListQuery } from "@/lib/i18n/use-translated-query"
import { Modal } from "@/components/ui/modal"
import { StatusBadge } from "@/components/ui/status-badge"
import { HypForm } from "@/components/entities/hypothesis-form"
import { v2 } from "@/lib/theme"
import { useT } from "@/lib/i18n/useT"
import { useStore } from "@/lib/store"
import { isOwner } from "@/lib/ownership"

// "Предложения" — гипотезы с lab_id=эта лаба, ещё не привязанные к цели
// (EntityHypothesis). Любой участник может предложить (новую или свою уже
// существующую), owner/admin — прикрепить (становится конкурирующей, см.
// LabHypothesesRail) или отклонить. См. ACCESS_POLICY.md, раздел
// "Предложенные гипотезы лабы". Живёт в боковой колонке рядом с
// "Конкурирующими гипотезами" — сознательно не отдельная вкладка вверху,
// чтобы не плодить два похожих меню про гипотезы в разных местах экрана.
export function LabHypothesesTab({ labId, labName, canManage, isMember, goalType, goalId, linkedHypIds, bare, includeOpened, onIncludeOpenedChange }: {
  labId: number; labName: string; canManage: boolean; isMember: boolean
  goalType?: string; goalId?: number; linkedHypIds: Set<number>
  bare?: boolean
  includeOpened: boolean; onIncludeOpenedChange: (v: boolean) => void
}) {
  const t = useT()
  const user = useStore(s => s.user)
  const qc = useQueryClient()
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showExistingModal, setShowExistingModal] = useState(false)
  const [existingSearch, setExistingSearch] = useState("")
  const [mobileOpen, setMobileOpen] = useState(false)

  const { data: allLabHyps = [], isLoading } = useTranslatedListQuery(
    ["hypotheses", "lab", labId, includeOpened],
    () => hypApi.list({ lab_id: labId, includeOpened }),
    "hypothesis",
    ["name", "description"],
  )
  // Открытая через связь (lab_id == null) — не «предложение»: её нельзя attach/reject,
  // показываем отдельной группой. Фильтр по lab_id обязателен.
  const proposals = allLabHyps.filter((h: any) => h.lab_id === labId && !linkedHypIds.has(h.id))
  const openedHyps = includeOpened ? allLabHyps.filter((h: any) => h.lab_id == null) : []

  const { data: myHyps = [] } = useQuery({
    queryKey: ["hypotheses"],
    queryFn: () => hypApi.list(),
    enabled: showExistingModal,
  })
  const proposableExisting = myHyps.filter((h: any) =>
    isOwner(user, h) && h.lab_id !== labId && !linkedHypIds.has(h.id) &&
    h.name.toLowerCase().includes(existingSearch.toLowerCase())
  )

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["hypotheses", "lab", labId] })
    invalidateLabCard(qc, labId)
    qc.invalidateQueries({ queryKey: ["hypotheses"] })
    if (goalType && goalId) {
      qc.invalidateQueries({ queryKey: [goalType, "hyps", goalId] })
      qc.invalidateQueries({ queryKey: [goalType, "competition", goalId] })
    }
  }

  const errorText = useMutationErrorText()
  const notifyPartial = usePartialCreateNotice()
  // lab_id форсирует сама форма (lockedLabId), видимость выводит бэкенд из публичности лаборатории;
  // createHypothesisFull — общая процедура создания (связи/картинки без дублей при частичном сбое).
  const create = useMutation({
    mutationFn: createHypothesisFull,
    onSuccess: (created: any) => { notifyPartial(created); invalidateAll(); setShowCreateModal(false) },
  })
  const closeCreate = () => { setShowCreateModal(false); create.reset() }

  const proposeExisting = useMutation({
    mutationFn: (h: any) => hypApi.update(h.id, { ...h, lab_id: labId }),
    onSuccess: () => { invalidateAll(); setShowExistingModal(false); setExistingSearch("") },
  })

  const attach = useMutation({
    mutationFn: (hid: number) => api.post(`/api/v1/labs/${labId}/hypotheses/${hid}/attach`),
    onSuccess: invalidateAll,
  })
  const reject = useMutation({
    mutationFn: (hid: number) => api.post(`/api/v1/labs/${labId}/hypotheses/${hid}/reject`),
    onSuccess: invalidateAll,
  })

  const segBtn = (active: boolean): React.CSSProperties => ({
    padding: "5px 10px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 12,
    fontWeight: active ? 600 : 400,
    background: active ? "#1f2436" : "transparent",
    color: active ? v2.t2 : v2.t3,
    transition: "background .12s ease, color .12s ease",
  })

  const segment = (
    <div role="tablist" aria-label={t("graph.segment.onlyLab")}
      style={{ display: "flex", gap: 2, padding: 3, borderRadius: 8, background: "#141829", border: `1px solid ${v2.bd}`, marginBottom: 10 }}>
      <button role="tab" aria-selected={!includeOpened} onClick={() => onIncludeOpenedChange(false)} style={segBtn(!includeOpened)}>
        {t("graph.segment.onlyLab")}
      </button>
      <button role="tab" aria-selected={includeOpened} onClick={() => onIncludeOpenedChange(true)} style={segBtn(includeOpened)}>
        {t("graph.segment.withOpened")}
      </button>
    </div>
  )

  const content = (
    <>
      {segment}
      <button type="button" onClick={() => setMobileOpen(o => !o)}
        className="w-full flex items-center gap-2 md:pointer-events-none md:cursor-default"
        style={{ marginBottom: mobileOpen ? 12 : 0, background: "none", border: "none", padding: 0, cursor: "pointer" }}>
        <Lightbulb size={14} style={{ color: "#E8A020" }} />
        <span style={{ fontSize: 12.5, fontWeight: 700, color: v2.t1 }}>{t("labTabs.proposalsTab")}</span>
        <span style={{ marginLeft: "auto", fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, color: v2.t3 }}>{proposals.length}</span>
        <ChevronDown size={14} className="md:hidden" style={{ color: v2.t3, transform: mobileOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.15s" }} />
      </button>

      <div className={mobileOpen ? "block mt-3 md:mt-0" : "hidden md:block md:mt-3"}>
        {isLoading ? (
          <div style={{ fontSize: 11.5, color: v2.t3 }}>…</div>
        ) : proposals.length === 0 ? (
          <div style={{ fontSize: 11.5, color: v2.t3, marginBottom: 10 }}>{t("labTabs.proposalsEmpty")}</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: "calc(100vh - 420px)", overflowY: "auto", marginBottom: 10 }}>
            {proposals.map((h: any) => (
              <div key={h.id} style={{ padding: "11px 12px", borderRadius: 10, background: v2.bg, border: `1px solid ${v2.bd}` }}>
                <div style={{ fontSize: 12, color: v2.t2, lineHeight: 1.4, marginBottom: 8 }}>{h.name}</div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <StatusBadge status={h.status} fontSize={9} />
                  {canManage && (
                    <div style={{ display: "flex", gap: 5 }}>
                      <button onClick={() => attach.mutate(h.id)} disabled={attach.isPending}
                        style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 600, padding: "4px 8px", borderRadius: 5, border: "1px solid #2ECC7140", background: "#2ECC7114", color: "#2ECC71", cursor: "pointer" }}>
                        <Check size={11} /> {t("labTabs.attach")}
                      </button>
                      <button onClick={() => reject.mutate(h.id)} disabled={reject.isPending}
                        style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 600, padding: "4px 8px", borderRadius: 5, border: "1px solid #E74C3C40", background: "#E74C3C14", color: "#E74C3C", cursor: "pointer" }}>
                        <XIcon size={11} /> {t("labTabs.reject")}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {isMember && !canManage && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <button onClick={() => setShowCreateModal(true)}
              style={{
                width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                padding: 10, borderRadius: 10, cursor: "pointer",
                background: "transparent", border: "1px dashed #E8A02060", color: "#E8A020",
                fontSize: 11.5, fontWeight: 600,
              }}>
              <Plus size={13} /> {t("labTabs.proposeHypothesis")}
            </button>
            <button onClick={() => setShowExistingModal(true)}
              style={{
                width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                padding: 10, borderRadius: 10, cursor: "pointer",
                background: "transparent", border: `1px dashed ${v2.bd2}`, color: v2.t3,
                fontSize: 11.5, fontWeight: 600,
              }}>
              {t("labTabs.proposeExisting")}
            </button>
          </div>
        )}
        {openedHyps.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: v2.t2, marginBottom: 6 }}>{t("labTabs.sharedWithLab")}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: "calc(100vh - 420px)", overflowY: "auto" }}>
              {openedHyps.map((h: any) => (
                <div key={h.id} style={{ padding: "11px 12px", borderRadius: 10, background: v2.bg, border: `1px dashed ${v2.bd}` }}>
                  <div style={{ fontSize: 12, color: v2.t2, lineHeight: 1.4, marginBottom: 8 }}>{h.name}</div>
                  <StatusBadge status={h.status} fontSize={9} />
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </>
  )

  const modals = (
    <>
      <Modal open={showCreateModal} onClose={closeCreate} title={t("labTabs.proposeHypothesis")} size="lg">
        {/* Рендерим только пока открыто: каждое открытие — чистая форма. */}
        {showCreateModal && (
          <HypForm
            lockedLabId={labId}
            hideLinksAndImages
            onSave={(v: any) => create.mutate(v)}
            onCancel={closeCreate}
            submitting={create.isPending}
            error={errorText(create.error)}
          />
        )}
      </Modal>

      <Modal open={showExistingModal} onClose={() => { setShowExistingModal(false); setExistingSearch("") }} title={t("labTabs.proposeExisting")} size="md">
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", border: `1px solid ${v2.bd2}`, borderRadius: 10 }}>
            <Search size={13} style={{ color: v2.t3 }} />
            <input value={existingSearch} onChange={e => setExistingSearch(e.target.value)} placeholder={t("hypotheses.searchPlaceholder")} autoFocus
              style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: 13, color: v2.t1 }} />
          </div>
          <div style={{ maxHeight: 320, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
            {proposableExisting.length === 0 && (
              <div style={{ textAlign: "center", padding: "20px 0", color: v2.t3, fontSize: 12 }}>{t("relations.noneFound")}</div>
            )}
            {proposableExisting.map((h: any) => (
              <button key={h.id} onClick={() => proposeExisting.mutate(h)} disabled={proposeExisting.isPending}
                style={{ textAlign: "left", padding: "10px 12px", borderRadius: 8, border: `1px solid ${v2.bd}`, background: v2.bg, color: v2.t2, cursor: "pointer", fontSize: 12.5 }}>
                {h.name}
              </button>
            ))}
          </div>
        </div>
      </Modal>
    </>
  )

  if (bare) return <>{content}{modals}</>
  return (
    <div className="w-full md:w-[300px] flex-shrink-0 self-start md:sticky md:top-5" style={{
      background: v2.surf, border: `1px solid ${v2.bd}`, borderRadius: 14, padding: 16,
    }}>
      {content}
      {modals}
    </div>
  )
}
