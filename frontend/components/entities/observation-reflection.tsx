"use client"
import { useState } from "react"
import { SlidersHorizontal } from "lucide-react"
import { ReflectionNudge } from "./reflection-nudge"
import { EditFactorsModal } from "./edit-factors-modal"
import { ActionButton } from "@/components/ui/action-button"
import { useT } from "@/lib/i18n/useT"
import { typeColor } from "@/lib/theme"

interface ObservationReflectionProps {
  observationId: number
}

/** Кнопка «Изменить факторы» вместе со своей модалкой — для ряда действий страницы. */
export function ObservationFactorsButton({ observationId }: ObservationReflectionProps) {
  const t = useT()
  const [editOpen, setEditOpen] = useState(false)
  return (
    <>
      <ActionButton icon={<SlidersHorizontal size={14} />} onClick={() => setEditOpen(true)}>
        {t("editFactorsButton.label")}
      </ActionButton>
      <EditFactorsModal entityType="observation" entityId={editOpen ? observationId : null} onClose={() => setEditOpen(false)} />
    </>
  )
}

/** Подсказка рефлексии — для полосы подсказок страницы. */
export function ObservationReflectionNudge({ observationId }: ObservationReflectionProps) {
  return <ReflectionNudge entityType="observation" entityId={observationId} accent={typeColor.observation} />
}

/**
 * Рефлексия для Observation — как и Worldview, без стадии "резолюции". Стандартные подписи
 * "За"/"Против" (не переопределяем, в отличие от Worldview): для наблюдения нет естественной пары
 * подтверждает/опровергает, это ближе к прогнозу. Цельная версия (кнопка + подсказка) для тех, кто
 * не раскладывает их по странице.
 */
export function ObservationReflection({ observationId }: ObservationReflectionProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <ObservationFactorsButton observationId={observationId} />
      <ObservationReflectionNudge observationId={observationId} />
    </div>
  )
}
