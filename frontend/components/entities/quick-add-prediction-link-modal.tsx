"use client"
// Создание прогноза БЕЗ hypothesis_id, сразу привязанного к зафиксированному родителю через
// generic Link — используется на табе "Прогнозы" у Observation/Worldview/Task/Question. НЕ ПУТАТЬ
// с AddForecastModal (components/entities/add-forecast-modal.tsx) — та создаёт прогноз с жёстким
// FK hypothesis_id. Форма — общая PredictionForm: здесь только обёртка (чип родителя и автопривязка).
// Раньше эта форма скрывала уверенность и молча слала 50 — такие прогнозы шли в калибровку как
// осознанная оценка. Если родитель живёт в лаборатории (labId), видимость принудительно "lab".
import { useMutationErrorText } from "@/lib/use-mutation-error-text"
import { TrendingUp } from "lucide-react"
import { useMyLabs } from "@/lib/use-my-labs"
import { Modal } from "@/components/ui/modal"
import { LockedTargetChip } from "@/components/entities/locked-target-chip"
import { PredictionForm } from "@/components/entities/forms/prediction-form"
import { createPredictionFull, type PredictionSubmit } from "@/lib/create-prediction"
import { useQuickCreateAndLink } from "@/lib/use-quick-create-and-link"
import { usePostCreateReflection } from "@/lib/use-post-create-reflection"
import { useT } from "@/lib/i18n/useT"
import { typeColor } from "@/lib/theme"

interface QuickAddPredictionLinkModalProps {
  open: boolean; onClose: () => void
  targetType: string; targetId: number; targetLabel: string
  onCreated?: (pred: any) => void
  labId?: number | null
}

export function QuickAddPredictionLinkModal({ open, onClose, targetType, targetId, targetLabel, onCreated, labId }: QuickAddPredictionLinkModalProps) {
  const t = useT()
  const { data: labs = [] } = useMyLabs(open && labId == null)
  const { show: showPostCreateReflection, modalNode: postCreateReflectionNode } = usePostCreateReflection("prediction")
  const errorText = useMutationErrorText()

  const create = useQuickCreateAndLink<PredictionSubmit>({
    entityType: "prediction",
    create: createPredictionFull,
    target: { type: targetType, id: targetId },
    linkType: "связано",
    invalidateKeys: [["predictions"]],
    onSuccess: (created) => {
      onCreated?.(created)
      onClose()
      showPostCreateReflection({ id: created.id, title: created.title, text: created.text })
    },
  })

  const close = () => { create.reset(); onClose() }

  return (
    <>
      <Modal open={open} onClose={close} title={t("actions.addPrediction")} size="lg">
        {open && (
          <PredictionForm
            lockedLabId={labId ?? null}
            labs={labs}
            showLinkPicker={false}
            header={<LockedTargetChip label={t("relations.title")} value={targetLabel} icon={TrendingUp} accent={typeColor[targetType] ?? "#4A90D9"} />}
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
