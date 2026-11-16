"use client"
// Создание гипотезы сразу привязанной к зафиксированному родителю через generic Link (не путать с
// EntityHypothesis — той полиморфной m2m-связью "конкурирующая гипотеза" в лабораториях, у неё свой UI
// в lab-hypotheses-rail). Форма — общая HypForm (та же, что на странице гипотез и во вкладке лаборатории,
// с критерием опровержения, тегами, статусом и зрелостью); здесь только обёртка: шапка с чипом родителя и
// типом связи (QuickAddHeader) и автопривязка. Если родитель живёт в лаборатории (labId), форма
// привязана к этой лабе (видимость выводит бэкенд, см. lib/lab-lock.ts).
import { useState } from "react"
import { Lightbulb } from "lucide-react"
import { useMyLabs } from "@/lib/use-my-labs"
import { Modal } from "@/components/ui/modal"
import { HypForm } from "@/components/entities/hypothesis-form"
import { QuickAddHeader } from "@/components/entities/forms/quick-add-header"
import { createHypothesisFull, type HypothesisSubmit } from "@/lib/create-hypothesis"
import { useQuickCreateAndLink } from "@/lib/use-quick-create-and-link"
import { useMutationErrorText } from "@/lib/use-mutation-error-text"
import { useT } from "@/lib/i18n/useT"

interface QuickAddHypothesisModalProps {
  open: boolean; onClose: () => void
  targetType: string; targetId: number; targetLabel: string
  onCreated?: (hyp: any) => void
  /** Если модалка открыта из контекста лаборатории — форма привязана к ней (см. ТЗ п.20: lab_id не вводится вручную). */
  labId?: number | null
}

export function QuickAddHypothesisModal({ open, onClose, targetType, targetId, targetLabel, onCreated, labId }: QuickAddHypothesisModalProps) {
  const t = useT()
  const errorText = useMutationErrorText()
  const { data: labs = [] } = useMyLabs(open && labId == null)
  const [linkType, setLinkType] = useState("связано")

  const create = useQuickCreateAndLink<HypothesisSubmit>({
    entityType: "hypothesis",
    create: createHypothesisFull,
    target: { type: targetType, id: targetId },
    linkType,
    invalidateKeys: [["hypotheses"]],
    onSuccess: (created) => { onCreated?.(created); handleClose() },
  })
  const handleClose = () => { setLinkType("связано"); create.reset(); onClose() }

  return (
    <Modal open={open} onClose={handleClose} title={t("actions.addHypothesis")} size="lg">
      {open && (
        <HypForm
          lockedLabId={labId ?? null}
          labs={labs}
          hideLinksAndImages
          header={<QuickAddHeader entityType="hypothesis" targetType={targetType} targetLabel={targetLabel} icon={Lightbulb} linkType={linkType} onLinkTypeChange={setLinkType} />}
          onSave={(v: HypothesisSubmit) => create.mutate(v)}
          onCancel={handleClose}
          submitting={create.isPending}
          error={errorText(create.error)}
        />
      )}
    </Modal>
  )
}
