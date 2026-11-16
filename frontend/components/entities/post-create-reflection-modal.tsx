"use client"
import { useState } from "react"
import { Modal } from "@/components/ui/modal"
import { Button } from "@/components/ui/button"
import { ReflectionDialog, ReflectionFactorInput } from "./reflection-dialog"
import { reflectionApiFor, ReflectionEntityType } from "@/lib/reflection-api"
import { useT } from "@/lib/i18n/useT"

export interface PostCreateReflectionTarget {
  id: number
  title?: string
  text?: string
}

interface PostCreateReflectionModalProps {
  entityType: ReflectionEntityType
  target: PostCreateReflectionTarget | null
  onClose: () => void
}

/**
 * Обобщённая версия — раньше была жёстко завязана на Prediction
 * (импортировала predApi напрямую). Теперь работает для любой сущности
 * из ReflectionEntityType (prediction/observation/worldview) через
 * reflectionApiFor, как и остальной reflection-стек. Раньше только
 * Прогнозы предлагали зафиксировать факторы сразу после создания —
 * Наблюдения и Убеждения полагались только на ручную кнопку "Изменить
 * факторы", из-за чего ReflectionNudge у них почти никогда не набирал
 * вторую версию факторов для сравнения (см. обсуждение в чате).
 */
export function PostCreateReflectionModal({ entityType, target, onClose }: PostCreateReflectionModalProps) {
  const t = useT()
  const reflectionApi = reflectionApiFor(entityType)
  const [expanded, setExpanded] = useState(false)
  const [busy, setBusy] = useState(false)
  if (!target) return null

  const handleSubmit = async (factors: ReflectionFactorInput[], rawText: string) => {
    setBusy(true)
    try {
      await reflectionApi.addReflection(target.id, { stage: "creation", factors, raw_dialogue_text: rawText })
      onClose()
    } finally { setBusy(false) }
  }

  if (!expanded) {
    return (
      <Modal open={!!target} onClose={onClose} title={t("postCreateReflection.savedTitle")} size="sm">
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ fontSize: 13, color: "#c0c0d8", lineHeight: 1.5 }}>
            {t("postCreateReflection.prompt")}
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button variant="ghost" onClick={onClose}>{t("postCreateReflection.skip")}</Button>
            <Button variant="primary" onClick={() => setExpanded(true)}>{t("postCreateReflection.fixate")}</Button>
          </div>
        </div>
      </Modal>
    )
  }

  return (
    <Modal open={!!target} onClose={onClose} title={t("postCreateReflection.dialogTitle")} size="md">
      <ReflectionDialog
        stage="creation"
        onSubmit={handleSubmit}
        onSkip={onClose}
        isPending={busy}
      />
    </Modal>
  )
}
