"use client"
import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Modal } from "@/components/ui/modal"
import { ReflectionDialog, ReflectionFactorInput } from "./reflection-dialog"
import { useT } from "@/lib/i18n/useT"
import { reflectionApiFor, ReflectionEntityType } from "@/lib/reflection-api"

interface EditFactorsModalProps {
  entityType: ReflectionEntityType
  entityId: number | null
  onClose: () => void
  /** См. ReflectionDialog — оверрайд подписи направления факторов (Worldview: Подтверждает/Опровергает) */
  forLabel?: string
  againstLabel?: string
}

/**
 * Точка входа для повторного сохранения factors на стадии creation —
 * без неё вторую версию для diff'а/ReflectionNudge создать негде
 * (PostCreateReflectionModal одноразовая, сразу после создания прогноза).
 * Доступна из DetailPanel, пока прогноз не проверен. Для Worldview — единственная
 * стадия рефлексии вообще, т.к. нет момента "резолюции".
 */
export function EditFactorsModal({ entityType, entityId, onClose, forLabel, againstLabel }: EditFactorsModalProps) {
  const t = useT()
  const qc = useQueryClient()
  const [busy, setBusy] = useState(false)
  const reflectionApi = reflectionApiFor(entityType)

  const save = useMutation({
    mutationFn: (payload: { factors: ReflectionFactorInput[]; rawText: string }) =>
      reflectionApi.addReflection(entityId!, { stage: "creation", factors: payload.factors, raw_dialogue_text: payload.rawText }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["entity-reflections", entityType, entityId] })
      onClose()
    },
  })

  if (!entityId) return null

  return (
    <Modal open={!!entityId} onClose={onClose} title={t("editFactorsModal.title")} size="md">
      <ReflectionDialog
        stage="creation"
        onSubmit={(factors, rawText) => save.mutate({ factors, rawText })}
        onSkip={onClose}
        isPending={save.isPending || busy}
        forLabel={forLabel}
        againstLabel={againstLabel}
      />
    </Modal>
  )
}
