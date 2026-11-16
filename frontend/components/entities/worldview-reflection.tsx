"use client"
import { useState } from "react"
import { useT } from "@/lib/i18n/useT"
import { ReflectionNudge } from "./reflection-nudge"
import { EditFactorsModal } from "./edit-factors-modal"
import { EditFactorsButton } from "./edit-factors-button"
import { typeColor } from "@/lib/theme"

interface WorldviewReflectionProps {
  worldviewId: number
}

/**
 * Рефлексия для Worldview — в отличие от Prediction, здесь нет стадии
 * "резолюции" (нет момента подведения итога у убеждения), поэтому нет
 * отдельных PostCreateReflectionModal/резолюционного диалога: один компонент
 * объединяет вход в редактирование факторов и показ инсайта о том, как
 * менялось мнение. Переиспользует те же ReflectionNudge/EditFactorsModal,
 * что и Prediction — см. lib/reflection-api.ts.
 */
export function WorldviewReflection({ worldviewId }: WorldviewReflectionProps) {
  const t = useT()
  const [editOpen, setEditOpen] = useState(false)
  const accent = typeColor.worldview

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <EditFactorsButton onClick={() => setEditOpen(true)} />

      <ReflectionNudge entityType="worldview" entityId={worldviewId} accent={accent} />

      <EditFactorsModal
        entityType="worldview"
        entityId={editOpen ? worldviewId : null}
        onClose={() => setEditOpen(false)}
        forLabel={t("worldviewReflection.confirmsLabel")}
        againstLabel={t("worldviewReflection.refutesLabel")}
      />
    </div>
  )
}
