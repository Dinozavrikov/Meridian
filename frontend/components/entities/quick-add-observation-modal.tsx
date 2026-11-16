"use client"
// frontend/components/entities/quick-add-observation-modal.tsx
//
// Создание наблюдения сразу привязанного к зафиксированному родителю (гипотеза/убеждение/задача/
// вопрос) через generic Link. Форма — общая ObservationForm (та же, что на странице и во вкладке
// лаборатории); здесь только обёртка: шапка с чипом родителя и типом связи (QuickAddHeader) и
// автопривязка. Если родитель живёт в лаборатории (labId), форма привязана к этой лабе.
import { useState } from "react"
import { Eye } from "lucide-react"
import { useMyLabs } from "@/lib/use-my-labs"
import { Modal } from "@/components/ui/modal"
import { QuickAddHeader } from "@/components/entities/forms/quick-add-header"
import { ObservationForm } from "@/components/entities/forms/observation-form"
import { createObservationFull, type ObservationSubmit } from "@/lib/create-observation"
import { useQuickCreateAndLink } from "@/lib/use-quick-create-and-link"
import { useMutationErrorText } from "@/lib/use-mutation-error-text"
import { useT } from "@/lib/i18n/useT"

interface QuickAddObservationModalProps {
  open: boolean
  onClose: () => void
  targetType: string
  targetId: number
  targetLabel: string
  onCreated?: (obs: any) => void
  labId?: number | null
}

export function QuickAddObservationModal({
  open, onClose, targetType, targetId, targetLabel, onCreated, labId,
}: QuickAddObservationModalProps) {
  const t = useT()
  const errorText = useMutationErrorText()
  const { data: labs = [] } = useMyLabs(open && labId == null)
  const [linkType, setLinkType] = useState("связано")

  const create = useQuickCreateAndLink<ObservationSubmit>({
    entityType: "observation",
    create: createObservationFull,
    target: { type: targetType, id: targetId },
    linkType,
    invalidateKeys: [["observations"]],
    onSuccess: (created) => { onCreated?.(created); handleClose() },
  })
  const handleClose = () => { setLinkType("связано"); create.reset(); onClose() }

  return (
    <Modal open={open} onClose={handleClose} title={t("actions.addObservation")} size="md">
      {open && (
        <ObservationForm
          lockedLabId={labId ?? null}
          labs={labs}
          showLinkPicker={false}
          header={<QuickAddHeader entityType="observation" targetType={targetType} targetLabel={targetLabel} icon={Eye} linkType={linkType} onLinkTypeChange={setLinkType} />}
          onSave={v => create.mutate(v)}
          onCancel={handleClose}
          submitting={create.isPending}
          error={errorText(create.error)}
        />
      )}
    </Modal>
  )
}
