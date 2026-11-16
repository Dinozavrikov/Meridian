"use client"
import { usePartialCreateNotice } from "@/lib/use-partial-create-notice"
import { useMutationErrorText } from "@/lib/use-mutation-error-text"
import { invalidateLabCard } from "@/lib/lab-queries"
import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Plus, Eye } from "lucide-react"
import { obsApi } from "@/lib/api"
import { useTranslatedListQuery } from "@/lib/i18n/use-translated-query"
import { Modal } from "@/components/ui/modal"
import { ObservationPreviewModal } from "@/components/labs/observation-preview-modal"
import { ObservationForm } from "@/components/entities/forms/observation-form"
import { createObservationFull } from "@/lib/create-observation"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/ui/status-badge"
import { v2 } from "@/lib/theme"
import { useT } from "@/lib/i18n/useT"
import { useStore } from "@/lib/store"
import { LabDeleteButton } from "@/components/labs/lab-delete-button"

export function LabObservationsTab({ labId, canEdit, includeOpened, onIncludeOpenedChange }: { labId: number; canEdit: boolean; includeOpened: boolean; onIncludeOpenedChange: (v: boolean) => void }) {
  const t = useT()
  const qc = useQueryClient()
  const user = useStore(s => s.user)
  const errorText = useMutationErrorText()
  const notifyPartial = usePartialCreateNotice()
  const [showModal, setShowModal] = useState(false)
  const [previewObs, setPreviewObs] = useState<any | null>(null)

  const { data = [], isLoading } = useTranslatedListQuery(
    ["observations", "lab", labId, includeOpened],
    () => obsApi.list({ lab_id: labId, includeOpened }),
    "observation",
    ["title", "text"],
  )
  const labItems = data.filter((o: any) => o.lab_id === labId)
  const openedItems = includeOpened ? data.filter((o: any) => o.lab_id == null) : []

  const segBtn = (active: boolean): React.CSSProperties => ({
    padding: "5px 10px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 12,
    fontWeight: active ? 600 : 400,
    background: active ? "#1f2436" : "transparent",
    color: active ? v2.t2 : v2.t3,
    transition: "background .12s ease, color .12s ease",
  })

  // Та же процедура создания, что на странице наблюдений и в quick-add
  // (inline-картинки, галерея, связи). Видимость/lab_id форсируются самой
  // формой через lockedLabId.
  const create = useMutation({
    mutationFn: createObservationFull,
    onSuccess: (created: any) => {
      notifyPartial(created)
      qc.invalidateQueries({ queryKey: ["observations"] })
      qc.invalidateQueries({ queryKey: ["related"] })
      invalidateLabCard(qc, labId)
      setShowModal(false)
    },
  })

  const closeModal = () => { setShowModal(false); create.reset() }

  // Удалённое уходит в корзину владельца: обновляем список лаборатории, общие списки, счётчики и корзину.
  const afterDelete = () => {
    qc.invalidateQueries({ queryKey: ["observations"] })
    invalidateLabCard(qc, labId)
    qc.invalidateQueries({ queryKey: ["trash"] })
  }

  return (
    <div className="p-5">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <div role="tablist" aria-label={t("graph.segment.onlyLab")}
          style={{ display: "flex", gap: 2, padding: 3, borderRadius: 8, background: "#141829", border: `1px solid ${v2.bd}` }}>
          <button role="tab" aria-selected={!includeOpened} onClick={() => onIncludeOpenedChange(false)} style={segBtn(!includeOpened)}>
            {t("graph.segment.onlyLab")}
          </button>
          <button role="tab" aria-selected={includeOpened} onClick={() => onIncludeOpenedChange(true)} style={segBtn(includeOpened)}>
            {t("graph.segment.withOpened")}
          </button>
        </div>
        {canEdit && (
          <Button variant="primary" onClick={() => setShowModal(true)}>
            <Plus size={13} /> {t("actions.addObservationTrigger")}
          </Button>
        )}
      </div>

      {isLoading ? (
        <div style={{ color: v2.t3, fontSize: 12 }}>…</div>
      ) : data.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 0", color: v2.t3, fontSize: 12 }}>
          {t("labTabs.observationsEmpty")}
        </div>
      ) : (
        <>
        {labItems.length === 0 && openedItems.length > 0 && (
          <div style={{ color: v2.t3, fontSize: 12, marginBottom: 12 }}>{t("labTabs.observationsEmpty")}</div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {labItems.map((o: any) => (
            <div key={o.id} onClick={() => setPreviewObs(o)}
              style={{ padding: "12px 14px", borderRadius: 10, background: v2.surf, border: `1px solid ${v2.bd}`, cursor: "pointer" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <Eye size={12} style={{ color: "#1ABC9C" }} />
                <span style={{ fontSize: 11, color: v2.t3 }}>{o.date}</span>
                <span style={{ flex: 1 }} />
                {user?.id != null && o.user_id === user.id && (
                  <LabDeleteButton entityType="observation" entity={o} remove={obsApi.delete} onDone={afterDelete} />
                )}
              </div>
              <div style={{ fontSize: 13, color: v2.t1, marginBottom: 6, fontWeight: 500 }}>
                {o.title || (o.text || "").slice(0, 60)}
              </div>
              <StatusBadge status={o.status} fontSize={9} />
            </div>
          ))}
        </div>
        {openedItems.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: v2.t2, marginBottom: 8 }}>{t("labTabs.sharedWithLab")}</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {openedItems.map((o: any) => (
                <div key={o.id} onClick={() => setPreviewObs(o)}
                  style={{ padding: "12px 14px", borderRadius: 10, background: v2.surf, border: `1px dashed ${v2.bd}`, cursor: "pointer" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <Eye size={12} style={{ color: v2.t3 }} />
                    <span style={{ fontSize: 11, color: v2.t3 }}>{o.date}</span>
                  </div>
                  <div style={{ fontSize: 13, color: v2.t1, marginBottom: 6, fontWeight: 500 }}>
                    {o.title || (o.text || "").slice(0, 60)}
                  </div>
                  <StatusBadge status={o.status} fontSize={9} />
                </div>
              ))}
            </div>
          </div>
        )}
        </>
      )}

      <Modal open={showModal} onClose={closeModal} title={t("observations.createTitle")} size="md">
        {/* Рендерим только пока открыто: каждое открытие — чистая форма. */}
        {showModal && (
          <ObservationForm
            lockedLabId={labId}
            onSave={v => create.mutate(v)}
            onCancel={closeModal}
            submitting={create.isPending}
            error={errorText(create.error)}
          />
        )}
      </Modal>
      <ObservationPreviewModal obs={previewObs} onClose={() => setPreviewObs(null)} />
    </div>
  )
}
