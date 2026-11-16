"use client"
import { createHypothesisFull, type HypothesisSubmit } from "@/lib/create-hypothesis"
import { runPostCreateSteps } from "@/lib/partial-create"
import { usePartialCreateNotice } from "@/lib/use-partial-create-notice"
import { useMutationErrorText } from "@/lib/use-mutation-error-text"
import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { Ruler } from "@/components/ui/ruler"
import { EntityQuickAddMenu } from "@/components/entities/entity-quick-add-menu"
import { HypForm } from "@/components/entities/hypothesis-form"
import { Modal } from "@/components/ui/modal"
import { DEFAULT_SCALES } from "@/lib/scales"
import { stripHtml } from "@/lib/strip-html"
import { StatusBadge } from "@/components/ui/status-badge"
import { Lightbulb, Plus, Search, X, Info, ChevronDown } from "lucide-react"
import { v2 } from "@/lib/theme"
import { useT } from "@/lib/i18n/useT"
import { useStore } from "@/lib/store"
import { isOwner } from "@/lib/ownership"
import { useListContentTranslation } from "@/lib/i18n/useContentT"

const MATURITY_SCALE = DEFAULT_SCALES.find(s => s.id === "maturity" && s.entity_type === "hypothesis")!
const STABILITY_SCALE = DEFAULT_SCALES.find(s => s.id === "stability" && s.entity_type === "hypothesis")!
const RISK_SCALE = DEFAULT_SCALES.find(s => s.id === "risk" && s.entity_type === "hypothesis")!

interface LabHypothesesRailProps {
  parentType: "task" | "question"
  parentId: number
  allHyps: any[]
  focusedId: number | null
  onFocus: (id: number | null) => void
  onPreview: (id: number) => void
  canEdit: boolean
  canAddForecast: boolean
  /** Без своей рамки/фона/паддинга — для объединённой карточки "Гипотезы"
      в лабе, где это только верхняя секция общей панели (см. labs/[id]/page.tsx). */
  bare?: boolean
  labId?: number | null
  labName?: string
}

export function LabHypothesesRail({ parentType, parentId, allHyps, focusedId, onFocus, onPreview, canEdit, canAddForecast, bare, labId, labName }: LabHypothesesRailProps) {
  const t = useT()
  const qc = useQueryClient()
  const user = useStore(s => s.user)
  const [showSearch, setShowSearch] = useState(false)
  const [search, setSearch] = useState("")
  const [showCreate, setShowCreate] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  const { data: linked = [] } = useQuery({
    queryKey: [parentType, "hyps", parentId],
    queryFn: () => api.get(`/api/v1/${parentType}s/${parentId}/hypotheses`).then(r => r.data),
    staleTime: 0, refetchOnMount: "always",
  })

  const add = useMutation({
    mutationFn: (hid: number) => api.post(`/api/v1/${parentType}s/${parentId}/hypotheses/${hid}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [parentType, "hyps", parentId] })
      qc.invalidateQueries({ queryKey: [parentType, "competition", parentId] })
    },
  })

  const errorText = useMutationErrorText()
  const notifyPartial = usePartialCreateNotice()
  // Создать новую гипотезу и сразу прикрепить как конкурирующую (в одно действие для owner/admin — в
  // отличие от proposal-флоу в LabHypothesesTab, здесь нет промежуточного статуса "предложена").
  // Запись создаёт createHypothesisFull (lab_id форсирует форма). Привязка — поздний шаг: если она упадёт,
  // гипотеза уже создана, поэтому мутация не падает (иначе повторное сохранение создало бы дубль), а
  // пользователь видит предупреждение. Для owner/admin create_hyp привязывает и сам, add тогда идемпотентен.
  const createAndAdd = useMutation({
    mutationFn: async (v: HypothesisSubmit) => {
      const created = await createHypothesisFull(v)
      const failed = await runPostCreateSteps([["attach", () => add.mutateAsync(created.id)]])
      const all = [...(created._failedSteps ?? []), ...failed]
      return all.length ? { ...created, _failedSteps: all } : created
    },
    onSuccess: (created: any) => { notifyPartial(created); setShowCreate(false) },
  })
  const closeCreate = () => { setShowCreate(false); createAndAdd.reset() }

  const tHyp = useListContentTranslation("hypothesis", linked, ["name", "description"], (h: any) => isOwner(user, h))
  const sorted = [...linked].sort((a: any, b: any) => (b.maturity ?? 0) - (a.maturity ?? 0))
  const linkedIds = new Set(linked.map((h: any) => h.id))
  const filtered = allHyps.filter(h => !linkedIds.has(h.id) && h.name.toLowerCase().includes(search.toLowerCase()))

  const content = (
    <>
      <button type="button" onClick={() => setMobileOpen(o => !o)}
        className="w-full flex items-center gap-2 md:pointer-events-none md:cursor-default"
        style={{ marginBottom: mobileOpen ? 12 : 0, background: "none", border: "none", padding: 0, cursor: "pointer" }}>
        <Lightbulb size={14} style={{ color: MATURITY_SCALE.color }} />
        <span style={{ fontSize: 12.5, fontWeight: 700, color: v2.t1 }}>{t("labHyps.title")}</span>
        <span style={{ marginLeft: "auto", fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, color: v2.t3 }}>{sorted.length}</span>
        <ChevronDown size={14} className="md:hidden" style={{ color: v2.t3, transform: mobileOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.15s" }} />
      </button>

      <div className={mobileOpen ? "block mt-3 md:mt-0" : "hidden md:block md:mt-3"}>
        {sorted.length === 0 ? (
          <div style={{ fontSize: 11.5, color: v2.t3, marginBottom: 10 }}>{t("labHyps.empty")}</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: "calc(100vh - 300px)", overflowY: "auto", marginBottom: 10 }}>
            {sorted.map((h: any) => {
              const focused = focusedId === h.id
              return (
                <div key={h.id} onClick={() => onFocus(focused ? null : h.id)}
                  style={{
                    padding: "11px 12px", borderRadius: 10, cursor: "pointer",
                    background: focused ? v2.surf2 : v2.bg, border: `1px solid ${focused ? v2.bd2 : v2.bd}`,
                    borderLeft: `2px solid ${focused ? MATURITY_SCALE.color : "transparent"}`,
                    transition: "background 0.12s, border-color 0.12s",
                  }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 6, marginBottom: 8 }}>
                    <div style={{ flex: 1, fontSize: 12, color: focused ? v2.t1 : v2.t2, fontWeight: focused ? 500 : 400, lineHeight: 1.4 }}>
                      {tHyp(h, "name", h.name)}
                    </div>
                    <button onClick={e => { e.stopPropagation(); onPreview(h.id) }}
                      style={{
                        flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                        width: 20, height: 20, borderRadius: 6, cursor: "pointer",
                        border: `1px solid ${MATURITY_SCALE.color}30`, background: `${MATURITY_SCALE.color}14`,
                        color: MATURITY_SCALE.color, transition: "background 0.12s",
                      }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = `${MATURITY_SCALE.color}28`}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = `${MATURITY_SCALE.color}14`}>
                      <Info size={12} />
                    </button>
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <StatusBadge status={h.status} fontSize={9} />
                  </div>
                  <Ruler
                    variant="compact" name="Зрелость" value={h.maturity ?? 0}
                    min={MATURITY_SCALE.min} max={MATURITY_SCALE.max} step={MATURITY_SCALE.step}
                    levels={MATURITY_SCALE.levels} color={MATURITY_SCALE.color} hideLabel
                  />
                  {focused && (
                    <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
                      <Ruler
                        variant="compact" name="Стабильность" value={h.stability ?? 0}
                        min={STABILITY_SCALE.min} max={STABILITY_SCALE.max} step={STABILITY_SCALE.step}
                        levels={STABILITY_SCALE.levels} color={STABILITY_SCALE.color} hideLabel
                      />
                      <Ruler
                        variant="compact" name="Риск" value={h.risk ?? 0}
                        min={RISK_SCALE.min} max={RISK_SCALE.max} step={RISK_SCALE.step}
                        levels={RISK_SCALE.levels} color={RISK_SCALE.color} hideLabel
                      />
                      {h.description && (
                        <div style={{ fontSize: 11, color: v2.t3, lineHeight: 1.5 }}>{stripHtml(tHyp(h, "description", h.description)).slice(0, 140)}</div>
                      )}
                    </div>
                  )}
                  {canAddForecast && (
                    <div style={{ marginTop: 8 }}>
                      <EntityQuickAddMenu entityType="hypothesis" entityId={h.id} entityName={h.name} labId={labId} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {canEdit && (
          <>
            <button onClick={() => setShowCreate(true)}
              style={{
                width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                padding: 10, borderRadius: 10, cursor: "pointer", marginBottom: 6,
                background: "transparent", border: `1px dashed ${MATURITY_SCALE.color}60`, color: MATURITY_SCALE.color,
                fontSize: 11.5, fontWeight: 600, transition: "border-color 0.12s, color 0.12s",
              }}>
              <Plus size={13} /> {t("labHyps.createNew")}
            </button>

            <button onClick={() => setShowSearch(s => !s)}
              style={{
                width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                padding: 10, borderRadius: 10, cursor: "pointer",
                background: "transparent", border: `1px dashed ${v2.bd2}`, color: v2.t3,
                fontSize: 11.5, fontWeight: 600, transition: "border-color 0.12s, color 0.12s",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = MATURITY_SCALE.color; (e.currentTarget as HTMLElement).style.color = MATURITY_SCALE.color }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = v2.bd2; (e.currentTarget as HTMLElement).style.color = v2.t3 }}>
              <Plus size={13} /> {t("labHyps.add")}
            </button>

            {showSearch && (
              <div style={{ marginTop: 8, background: v2.bg, border: `1px solid ${v2.bd2}`, borderRadius: 10, overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderBottom: `1px solid ${v2.bd}` }}>
                  <Search size={12} style={{ color: v2.t3 }} />
                  <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t("labHyps.searchPlaceholder")} autoFocus
                    style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: 12.5, color: v2.t1 }} />
                  <button onClick={() => setShowSearch(false)} style={{ background: "none", border: "none", color: v2.t3, cursor: "pointer", display: "flex" }}><X size={12} /></button>
                </div>
                <div style={{ maxHeight: 200, overflowY: "auto" }}>
                  {filtered.slice(0, 20).map((h: any) => (
                    <div key={h.id} onClick={() => { add.mutate(h.id); setShowSearch(false); setSearch("") }}
                      style={{ padding: "9px 12px", cursor: "pointer", fontSize: 12, color: v2.t3, borderTop: `1px solid ${v2.bd}` }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = v2.t1}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = v2.t3}>
                      {h.name}
                    </div>
                  ))}
                  {filtered.length === 0 && <div style={{ padding: 14, textAlign: "center", color: v2.t3, fontSize: 11.5 }}>Ничего не найдено</div>}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  )

  const modal = (
    <Modal open={showCreate} onClose={closeCreate} title={t("labHyps.createNew")} size="lg">
      {/* Рендерим только пока открыто: каждое открытие — чистая форма. */}
      {showCreate && (
        <HypForm
          lockedLabId={labId ?? null}
          labs={[]}
          hideLinksAndImages
          onSave={(v: HypothesisSubmit) => createAndAdd.mutate(v)}
          onCancel={closeCreate}
          submitting={createAndAdd.isPending}
          error={errorText(createAndAdd.error)}
        />
      )}
    </Modal>
  )

  if (bare) return <>{content}{modal}</>
  return (
    <div className="w-full md:w-[300px] flex-shrink-0 self-start md:sticky md:top-5" style={{
      background: v2.surf, border: `1px solid ${v2.bd}`, borderRadius: 14, padding: 16,
    }}>
      {content}
      {modal}
    </div>
  )
}
