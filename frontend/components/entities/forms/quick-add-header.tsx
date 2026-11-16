"use client"
// frontend/components/entities/forms/quick-add-header.tsx
//
// Шапка модалок «создать и привязать»: чип зафиксированного родителя + выбор типа связи
// по словарю пары записей (lib/link-vocab). Одна на все такие модалки вместо копий пилюль в каждой.
import type { LucideIcon } from "lucide-react"
import { useT } from "@/lib/i18n/useT"
import { LockedTargetChip } from "@/components/entities/locked-target-chip"
import { getLinkTypes } from "@/components/entities/link-types"
import { isNeutralOnly, linkTypesFor } from "@/lib/link-vocab"
import { influenceOptions } from "@/lib/worldview-influence"
import { FIELD_LABEL_STYLE } from "@/components/entities/forms/form-parts"
import { ink, typeColor } from "@/lib/theme"

interface QuickAddHeaderProps {
  targetType: string
  targetLabel: string
  icon: LucideIcon
  linkType: string
  onLinkTypeChange: (v: string) => void
  /** Тип создаваемой записи: типы связи берутся по словарю пары (создаваемая запись, родитель). */
  entityType?: string
}

export function QuickAddHeader({ targetType, targetLabel, icon, linkType, onLinkTypeChange, entityType }: QuickAddHeaderProps) {
  const t = useT()
  const types = entityType ? linkTypesFor(getLinkTypes(t), entityType, targetType, influenceOptions(t)) : getLinkTypes(t)
  const neutralOnly = isNeutralOnly(types)
  return (
    <>
      <LockedTargetChip label={t("relations.title")} value={targetLabel} icon={icon} accent={typeColor[targetType] ?? "#4A90D9"} />
      <div>
        <label style={{ ...FIELD_LABEL_STYLE, display: "block", marginBottom: 6 }}>{t("relations.linkTypeLabel")}</label>
        <div style={{ display: "flex", gap: 6 }}>
          {types.map(lt => (
            <button key={lt.value} type="button" onClick={() => onLinkTypeChange(lt.value)}
              style={{
                fontSize: 11, padding: "4px 12px", borderRadius: 20,
                border: `1px solid ${linkType === lt.value ? lt.color : "#222232"}`,
                background: linkType === lt.value ? `${lt.color}18` : "transparent",
                color: linkType === lt.value ? lt.color : "#9696a4",
                cursor: "pointer", fontWeight: linkType === lt.value ? 600 : 400,
              }}>
              {lt.label}
            </button>
          ))}
        </div>
        {neutralOnly && <div style={{ marginTop: 6, fontSize: 11, color: ink.muted }}>{t("quickAdd.sameTypeNeutral")}</div>}
      </div>
    </>
  )
}
