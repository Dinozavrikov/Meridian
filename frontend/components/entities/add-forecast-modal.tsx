"use client"
// frontend/components/entities/add-forecast-modal.tsx
//
// Модалка создания прогноза, привязанного к конкретной гипотезе. Форма — общая PredictionForm
// (та же, что на странице прогнозов и во вкладке лаборатории); здесь только обёртка: чип
// закреплённой гипотезы и инвалидация. Гипотеза ЗАФИКСИРОВАНА — её нельзя сменить. Кнопка
// "Добавить прогноз" всегда открывается В КОНТЕКСТЕ конкретной гипотезы (со страницы гипотезы,
// из Ленты, из Лаборатории). Если гипотеза живёт в лаборатории (labId), видимость принудительно
// "lab" этой лабы.
//
// Не путать с LinkModal (relations-panel.tsx) — та линкует уже СУЩЕСТВУЮЩИЙ прогноз к гипотезе
// через graph/links. Эта модалка создаёт НОВЫЙ прогноз с hypothesis_id сразу при создании.
import { usePartialCreateNotice } from "@/lib/use-partial-create-notice"
import { useMutationErrorText } from "@/lib/use-mutation-error-text"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Lightbulb } from "lucide-react"
import { LockedTargetChip } from "@/components/entities/locked-target-chip"
import { Modal } from "@/components/ui/modal"
import { PredictionForm } from "@/components/entities/forms/prediction-form"
import { createPredictionFull } from "@/lib/create-prediction"
import { hypApi } from "@/lib/api"
import { useMyLabs } from "@/lib/use-my-labs"
import { useT } from "@/lib/i18n/useT"
import { usePostCreateReflection } from "@/lib/use-post-create-reflection"

interface AddForecastModalProps {
  open: boolean
  onClose: () => void
  /** Гипотеза, к которой создаётся прогноз. Зафиксирована — сменить нельзя. */
  hypothesisId: number
  /** Если название гипотезы уже есть у вызывающей стороны — передаём, чтобы не делать лишний запрос. */
  hypothesisName?: string
  onCreated?: (prediction: any) => void
  labId?: number | null
}

export function AddForecastModal({ open, onClose, hypothesisId, hypothesisName, onCreated, labId }: AddForecastModalProps) {
  const t = useT()
  const qc = useQueryClient()

  const { data: hyp } = useQuery({
    queryKey: ["hypotheses", hypothesisId],
    queryFn: () => hypApi.get(hypothesisId),
    enabled: open && !hypothesisName,
    staleTime: 60_000,
  })
  const { data: labs = [] } = useMyLabs(open && labId == null)
  const resolvedHypName = hypothesisName ?? hyp?.name ?? "…"
  const { show: showPostCreateReflection, modalNode: postCreateReflectionNode } = usePostCreateReflection("prediction")
  const errorText = useMutationErrorText()
  const notifyPartial = usePartialCreateNotice()

  const create = useMutation({
    mutationFn: createPredictionFull,
    onSuccess: (newP: any) => {
      notifyPartial(newP)
      qc.invalidateQueries({ queryKey: ["predictions"] })
      qc.invalidateQueries({ queryKey: ["related", "hypothesis", hypothesisId] })
      qc.invalidateQueries({ queryKey: ["feed"] })
      onCreated?.(newP)
      onClose()
      showPostCreateReflection({ id: newP.id, title: newP.title, text: newP.text })
    },
  })

  const close = () => { create.reset(); onClose() }

  return (
    <>
      <Modal open={open} onClose={close} title={t("actions.addPrediction")} size="lg">
        {open && (
          <PredictionForm
            lockedHypothesisId={hypothesisId}
            lockedLabId={labId ?? null}
            labs={labs}
            header={<LockedTargetChip label={t("predictions.hypothesisLabel")} value={resolvedHypName} icon={Lightbulb} />}
            onSave={v => create.mutate(v)}
            onCancel={close}
            submitting={create.isPending}
            error={errorText(create.error)}
          />
        )}
      </Modal>
      {postCreateReflectionNode}
    </>
  )
}
