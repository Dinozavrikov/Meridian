"use client"
import { usePartialCreateNotice } from "@/lib/use-partial-create-notice"
import { useMutationErrorText } from "@/lib/use-mutation-error-text"
import { invalidateLabCard } from "@/lib/lab-queries"
import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Plus, Target } from "lucide-react"
import { predApi } from "@/lib/api"
import { useTranslatedListQuery } from "@/lib/i18n/use-translated-query"
import { Modal } from "@/components/ui/modal"
import { PredictionPreviewModal } from "@/components/labs/prediction-preview-modal"
import { PredictionForm } from "@/components/entities/forms/prediction-form"
import { createPredictionFull } from "@/lib/create-prediction"
import { usePostCreateReflection } from "@/lib/use-post-create-reflection"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/ui/status-badge"
import { v2 } from "@/lib/theme"
import { useT } from "@/lib/i18n/useT"
import { useStore } from "@/lib/store"
import { LabDeleteButton } from "@/components/labs/lab-delete-button"

export function LabPredictionsTab({ labId, canEdit, includeOpened, onIncludeOpenedChange }: { labId: number; canEdit: boolean; includeOpened: boolean; onIncludeOpenedChange: (v: boolean) => void }) {
  const t = useT()
  const qc = useQueryClient()
  const user = useStore(s => s.user)
  const errorText = useMutationErrorText()
  const notifyPartial = usePartialCreateNotice()
  const [showModal, setShowModal] = useState(false)
  const [previewPred, setPreviewPred] = useState<any | null>(null)
  const { show: showPostCreateReflection, modalNode: postCreateReflectionNode } = usePostCreateReflection("prediction")

  const { data = [], isLoading } = useTranslatedListQuery(
    ["predictions", "lab", labId, includeOpened],
    () => predApi.list({ lab_id: labId, includeOpened }),
    "prediction",
    ["title", "text"],
  )
  const labItems = data.filter((p: any) => p.lab_id === labId)
  const openedItems = includeOpened ? data.filter((p: any) => p.lab_id == null) : []

  const segBtn = (active: boolean): React.CSSProperties => ({
    padding: "5px 10px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 12,
    fontWeight: active ? 600 : 400,
    background: active ? "#1f2436" : "transparent",
    color: active ? v2.t2 : v2.t3,
    transition: "background .12s ease, color .12s ease",
  })

  // Та же процедура создания, что на странице прогнозов и в модалках (inline-картинки, галерея,
  // связи). Видимость/lab_id форсируются самой формой через lockedLabId; уверенность спрашивается
  // всегда — прогноз без неё выпадает из калибровки.
  const create = useMutation({
    mutationFn: createPredictionFull,
    onSuccess: (created: any) => {
      notifyPartial(created)
      qc.invalidateQueries({ queryKey: ["predictions"] })
      qc.invalidateQueries({ queryKey: ["related"] })
      invalidateLabCard(qc, labId)
      setShowModal(false)
      showPostCreateReflection({ id: created.id, title: created.title, text: created.text })
    },
  })

  const closeModal = () => { setShowModal(false); create.reset() }

  // Удалённое уходит в корзину владельца: обновляем список лаборатории, общие списки, счётчики и корзину.
  const afterDelete = () => {
    qc.invalidateQueries({ queryKey: ["predictions"] })
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
            <Plus size={13} /> {t("actions.addPrediction")}
          </Button>
        )}
      </div>

      {isLoading ? (
        <div style={{ color: v2.t3, fontSize: 12 }}>…</div>
      ) : data.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 0", color: v2.t3, fontSize: 12 }}>
          {t("labTabs.predictionsEmpty")}
        </div>
      ) : (
        <>
        {labItems.length === 0 && openedItems.length > 0 && (
          <div style={{ color: v2.t3, fontSize: 12, marginBottom: 12 }}>{t("labTabs.predictionsEmpty")}</div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {labItems.map((p: any) => (
            <div key={p.id} onClick={() => setPreviewPred(p)}
              style={{ padding: "12px 14px", borderRadius: 10, background: v2.surf, border: `1px solid ${v2.bd}`, cursor: "pointer" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <Target size={12} style={{ color: "#3498DB" }} />
                <span style={{ flex: 1 }} />
                {user?.id != null && p.user_id === user.id && (
                  <LabDeleteButton entityType="prediction" entity={p} remove={predApi.delete} onDone={afterDelete} />
                )}
              </div>
              <div style={{ fontSize: 13, color: v2.t1, marginBottom: 6, fontWeight: 500 }}>
                {p.title || (p.text || "").slice(0, 60)}
              </div>
              <StatusBadge status={p.status} fontSize={9} />
            </div>
          ))}
        </div>
        {openedItems.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: v2.t2, marginBottom: 8 }}>{t("labTabs.sharedWithLab")}</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {openedItems.map((p: any) => (
                <div key={p.id} onClick={() => setPreviewPred(p)}
                  style={{ padding: "12px 14px", borderRadius: 10, background: v2.surf, border: `1px dashed ${v2.bd}`, cursor: "pointer" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <Target size={12} style={{ color: v2.t3 }} />
                  </div>
                  <div style={{ fontSize: 13, color: v2.t1, marginBottom: 6, fontWeight: 500 }}>
                    {p.title || (p.text || "").slice(0, 60)}
                  </div>
                  <StatusBadge status={p.status} fontSize={9} />
                </div>
              ))}
            </div>
          </div>
        )}
        </>
      )}

      <Modal open={showModal} onClose={closeModal} title={t("predictions.createTitle")} size="lg">
        {/* Рендерим только пока открыто: каждое открытие — чистая форма. */}
        {showModal && (
          <PredictionForm
            lockedLabId={labId}
            onSave={v => create.mutate(v)}
            onCancel={closeModal}
            submitting={create.isPending}
            error={errorText(create.error)}
          />
        )}
      </Modal>
      <PredictionPreviewModal pred={previewPred} onClose={() => setPreviewPred(null)} />
      {postCreateReflectionNode}
    </div>
  )
}
