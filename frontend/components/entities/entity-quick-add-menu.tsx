"use client"
import { useState } from "react"
import { Eye, Lightbulb, TrendingUp, Compass, CheckSquare, HelpCircle, Plus, Link2 } from "lucide-react"
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu"
import { getLinkTypes } from "@/components/entities/link-types"
import { linkTypesFor } from "@/lib/link-vocab"
import { LinkExistingModal } from "@/components/entities/link-existing-modal"
import { QuickAddObservationModal } from "@/components/entities/quick-add-observation-modal"
import { QuickAddHypothesisModal } from "@/components/entities/quick-add-hypothesis-modal"
import { QuickAddWorldviewModal } from "@/components/entities/quick-add-worldview-modal"
import { QuickAddTaskModal } from "@/components/entities/quick-add-task-modal"
import { QuickAddQuestionModal } from "@/components/entities/quick-add-question-modal"
import { QuickAddPredictionLinkModal } from "@/components/entities/quick-add-prediction-link-modal"
import { AddForecastModal } from "@/components/entities/add-forecast-modal"
import { influenceOptions } from "@/lib/worldview-influence"
import { useT } from "@/lib/i18n/useT"
import { ActionButton } from "@/components/ui/action-button"
import { ink, typeColor, theme } from "@/lib/theme"
import { useQueryClient } from "@tanstack/react-query"

type TargetType = "observation" | "hypothesis" | "prediction" | "worldview" | "task" | "question"

// labelKey — переиспользует entityType.* (см. lib/i18n/useTypeRu.ts), те же
// слова уже переведены там, дублировать не нужно.
const TARGET_META: Record<TargetType, { labelKey: string; icon: any }> = {
  observation: { labelKey: "entityType.observation", icon: Eye },
  hypothesis:  { labelKey: "entityType.hypothesis",  icon: Lightbulb },
  prediction:  { labelKey: "entityType.prediction",  icon: TrendingUp },
  worldview:   { labelKey: "entityType.worldview",   icon: Compass },
  task:        { labelKey: "entityType.task",        icon: CheckSquare },
  question:    { labelKey: "entityType.question",    icon: HelpCircle },
}

// В списке есть и свой тип: запись можно связать с другой записью того же типа (тип связи тогда только нейтральный, см. linkTypesFor).
const APPLICABLE_TARGETS: Record<string, TargetType[]> = {
  hypothesis:  ["observation", "hypothesis", "prediction", "worldview", "task", "question"],
  observation: ["observation", "hypothesis", "prediction", "worldview", "task", "question"],
  prediction:  ["observation", "prediction", "worldview", "task", "question"],
  worldview:   ["observation", "hypothesis", "prediction", "worldview", "task", "question"],
  task:        ["observation", "hypothesis", "prediction", "worldview", "task", "question"],
  question:    ["observation", "hypothesis", "prediction", "worldview", "task", "question"],
}

interface EntityQuickAddMenuProps {
  entityType: string
  entityId: number
  entityName: string
  /** Если меню вызывается изнутри лаборатории — прокидывается сюда, а
   *  дальше во все create-модалки, чтобы они предзаполняли visibility="lab"/
   *  lab_id (см. ТЗ п.20 — lab_id не должен вводиться пользователем вручную). */
  labId?: number | null
}

export function EntityQuickAddMenu({ entityType, entityId, entityName, labId }: EntityQuickAddMenuProps) {
  const t = useT()
  const qc = useQueryClient()
  const [activeModal, setActiveModal] = useState<{ target: TargetType; mode: "create" | "link" } | null>(null)
  // Что делать с выбранным типом: создать новую запись и привязать, или привязать существующую.
  const [pickMode, setPickMode] = useState<"create" | "link">("create")

  const targets = APPLICABLE_TARGETS[entityType] ?? []
  if (targets.length === 0) return null

  const close = () => setActiveModal(null)
  const invalidate = () => qc.invalidateQueries({ queryKey: ["related", entityType, entityId] })

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <ActionButton icon={<Plus size={14} />}>{t("actions.addRelated")}</ActionButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent minWidth={320}>
          <div role="group" aria-label={t("actions.addRelated")} style={{
            display: "flex", gap: 4, padding: 3, margin: "2px 2px 8px", borderRadius: 10,
            background: ink.well, border: `1px solid ${ink.line}`,
          }}>
            {(["create", "link"] as const).map(m => (
              <button
                key={m} type="button" aria-pressed={pickMode === m}
                onClick={e => { e.preventDefault(); setPickMode(m) }}
                style={{
                  flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  minHeight: 40, padding: "4px 8px", borderRadius: 8, border: "none", cursor: "pointer",
                  fontSize: 13, fontWeight: pickMode === m ? 600 : 500, lineHeight: 1.2, textAlign: "center",
                  background: pickMode === m ? "#262b42" : "transparent",
                  color: pickMode === m ? "#f2efe9" : ink.label,
                }}
              >
                {m === "create" ? <Plus size={14} style={{ flexShrink: 0 }} /> : <Link2 size={14} style={{ flexShrink: 0 }} />}
                {m === "create" ? t("quickAdd.createAndLink") : t("quickAdd.linkExisting")}
              </button>
            ))}
          </div>
          {targets.map(target => {
            const meta = TARGET_META[target]
            const Icon = meta.icon
            const color = typeColor[target]
            return (
              <DropdownMenuItem
                key={target}
                icon={
                  <span aria-hidden style={{
                    width: 28, height: 28, borderRadius: 8, flexShrink: 0, background: `${color}22`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <Icon size={15} style={{ color }} />
                  </span>
                }
                onSelect={() => setActiveModal({ target, mode: pickMode })}
              >
                {t(meta.labelKey)}
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Create-модалки СМОНТИРОВАНЫ ВСЕГДА, видимость через open — а не
          условный рендер JSX. Причина: некоторые из них (прогноз) после
          onCreated показывают ещё один шаг (PostCreateReflectionModal),
          управляемый ИХ СОБСТВЕННЫМ внутренним состоянием. Если бы весь
          компонент условно убирался из дерева сразу вместе с закрытием
          (activeModal -> null), React бы его размонтировал раньше, чем
          успевал отрендериться второй шаг — тот просто пропадал. */}
      <QuickAddObservationModal open={activeModal?.mode === "create" && activeModal.target === "observation"} onClose={close} targetType={entityType} targetId={entityId} targetLabel={entityName} onCreated={invalidate} labId={labId} />
      <QuickAddHypothesisModal open={activeModal?.mode === "create" && activeModal.target === "hypothesis"} onClose={close} targetType={entityType} targetId={entityId} targetLabel={entityName} onCreated={invalidate} labId={labId} />
      <QuickAddWorldviewModal open={activeModal?.mode === "create" && activeModal.target === "worldview"} onClose={close} targetType={entityType} targetId={entityId} targetLabel={entityName} onCreated={invalidate} labId={labId} />
      <QuickAddTaskModal open={activeModal?.mode === "create" && activeModal.target === "task"} onClose={close} targetType={entityType} targetId={entityId} targetLabel={entityName} onCreated={invalidate} labId={labId} />
      <QuickAddQuestionModal open={activeModal?.mode === "create" && activeModal.target === "question"} onClose={close} targetType={entityType} targetId={entityId} targetLabel={entityName} onCreated={invalidate} labId={labId} />
      {entityType === "hypothesis" && (
        <AddForecastModal open={activeModal?.mode === "create" && activeModal.target === "prediction"} onClose={close} hypothesisId={entityId} hypothesisName={entityName} onCreated={invalidate} labId={labId} />
      )}
      {entityType !== "hypothesis" && (
        <QuickAddPredictionLinkModal open={activeModal?.mode === "create" && activeModal.target === "prediction"} onClose={close} targetType={entityType} targetId={entityId} targetLabel={entityName} onCreated={invalidate} labId={labId} />
      )}

      {activeModal?.mode === "link" && activeModal.target === "worldview" && (
        <LinkExistingModal entityType={entityType} entityId={entityId} onlyType="worldview" linkTypes={influenceOptions(t)} defaultLinkType="strengthens" onClose={close} />
      )}
      {activeModal?.mode === "link" && activeModal.target === "task" && (
        <LinkExistingModal entityType={entityType} entityId={entityId} onlyType="task" linkTypes={[{ value: "связано", label: t("linkType.related"), color: theme.edgeNeutral }]} defaultLinkType="связано" onClose={close} />
      )}
      {activeModal?.mode === "link" && (activeModal.target === "observation" || activeModal.target === "hypothesis" || activeModal.target === "prediction" || activeModal.target === "question") && (
        <LinkExistingModal entityType={entityType} entityId={entityId} onlyType={activeModal.target} linkTypes={linkTypesFor(getLinkTypes(t), entityType, activeModal.target, influenceOptions(t))} defaultLinkType="связано" onClose={close} />
      )}
    </>
  )
}
