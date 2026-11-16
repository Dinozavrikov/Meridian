"use client"
import { useState } from "react"
import { Milestone } from "lucide-react"
import { useT } from "@/lib/i18n/useT"
import { useEntityStage } from "@/lib/use-entity-stage"
import { STAGE_VALUES, stageLabel } from "@/lib/stage-labels"
import { Modal } from "@/components/ui/modal"

interface StageBadgeProps {
  entityType: string
  entityId: number
  isOwner: boolean
  accent?: string
}

// Компактный индикатор стадии (см. STAGE_VALUES/stageLabel в lib/stage-labels.ts) — статичный чип
// для гостя/чужого просмотра, кликабельный для владельца (или owner/admin лабы, когда
// entityType=="lab": права те же, что проверяет backend, здесь дублируются только на уровне
// UI-affordance, сам PUT backend перепроверит независимо).
// Отсутствие записи ("стадия не отслеживается") — валидное состояние: для владельца кнопка
// "начать отслеживать", для остальных компонент рендерит null.
// На страницах сущностей вместо него теперь StageTrack (паспорт); этот чип остаётся для лаборатории.
export function StageBadge({ entityType, entityId, isOwner, accent = "#4A90D9" }: StageBadgeProps) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const { stage, isLoading, isPending, setStage } = useEntityStage(entityType, entityId)

  if (isLoading) return null
  if (!stage && !isOwner) return null

  return (
    <>
      <button
        onClick={() => isOwner && setOpen(true)}
        style={{
          fontSize: 11, padding: "4px 10px", borderRadius: 6,
          border: `1px solid ${accent}30`, background: `${accent}0c`, color: accent,
          cursor: isOwner ? "pointer" : "default",
          display: "inline-flex", alignItems: "center", gap: 4,
          transition: "all 0.12s", fontWeight: 500, whiteSpace: "nowrap",
        }}
      >
        <Milestone size={10} />
        {stage ? stageLabel(t, stage) : t("stagePanel.notTracked")}
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title={t("stagePanel.modalTitle")}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {STAGE_VALUES.map(s => {
            const active = stage === s
            return (
              <button
                key={s}
                onClick={() => setStage(s, { onSuccess: () => setOpen(false) })}
                disabled={isPending}
                style={{
                  textAlign: "left", padding: "10px 14px", borderRadius: 8,
                  border: `1px solid ${active ? accent : "#1a1a28"}`,
                  background: active ? `${accent}14` : "transparent",
                  color: active ? accent : "#c8c8e0",
                  cursor: isPending ? "default" : "pointer",
                  fontSize: 13, fontWeight: active ? 600 : 400,
                }}
              >
                {stageLabel(t, s)}
              </button>
            )
          })}
        </div>
      </Modal>
    </>
  )
}
