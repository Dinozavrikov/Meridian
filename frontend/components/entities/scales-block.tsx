"use client"
import { useState } from "react"
import { useEntityScales, useScaleValues } from "@/lib/use-scales"
import { ScalesGrid } from "@/components/entities/scales-grid"
import { ScaleEditModal } from "@/components/entities/scale-edit-modal"
import { useT } from "@/lib/i18n/useT"
import { getLockedScaleIds } from "@/lib/scale-locks"

interface EntityScalesBlockProps {
  entityType: string
  entityId: number
  values: Record<string, any>
  onSave: (patch: Record<string, number | null>) => void
  isPending?: boolean
  // Временная заглушка: пока нет агрегирующей формулы по голосам всех
  // пользователей, редактировать шкалу может только владелец сущности
  // (см. backend/app/api/v1/scales.py set_value). Не-владелец видит те же
  // значения, но без интерактива — onChange не передаётся в ScalesGrid.
  isOwner: boolean
}

/**
 * Блок шкал для вкладки «Детали» любой сущности.
 * Показывает встроенные шкалы (значения — поля сущности, патчатся через onSave)
 * и кастомные шкалы пользователя (значения — в scale_values, патчатся напрямую).
 * Если для entityType нет ни одной шкалы — ничего не рендерит.
 */
export function EntityScalesBlock({ entityType, entityId, values, onSave, isPending, isOwner }: EntityScalesBlockProps) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const { scales, isLoading } = useEntityScales(entityType)
  const { values: allValues, setCustomValue, isPending: customPending } = useScaleValues(entityType, entityId, values)
  const lockedIds = getLockedScaleIds(entityType, values)

  if (isLoading || scales.length === 0) return null

  const builtinIds = new Set(scales.filter(s => s.builtin).map(s => s.id))
  const write = (scaleId: string, value: number | null) =>
    builtinIds.has(scaleId) ? onSave({ [scaleId]: value }) : setCustomValue(scaleId, value)

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <ScalesGrid
        entityType={entityType}
        values={allValues}
        scales={scales}
        lockedIds={lockedIds}
        onChange={isOwner ? write : undefined}
      />
      {isOwner ? (
        <button
          onClick={() => setOpen(true)}
          style={{ alignSelf: "flex-end", padding: "4px 12px", borderRadius: 6, border: "1px solid #2a2a40", background: "transparent", color: "#9295a5", fontSize: 11, cursor: "pointer", transition: "all 0.15s" }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#c0c0d8"; (e.currentTarget as HTMLElement).style.borderColor = "#4A90D950" }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "#9395a5"; (e.currentTarget as HTMLElement).style.borderColor = "#2a2a40" }}
        >
          {t("entityScales.editButton")}
        </button>
      ) : (
        <span style={{ alignSelf: "flex-end", fontSize: 11, color: "#9295a5" }}>
          {t("ownership.editOwnerOnly")}
        </span>
      )}
      {isOwner && (
        <ScaleEditModal
          open={open}
          onClose={() => setOpen(false)}
          scales={scales}
          values={allValues}
          lockedIds={lockedIds}
          onSave={patch => Object.entries(patch).forEach(([k, v]) => write(k, v))}
          isPending={isPending || customPending}
        />
      )}
    </div>
  )
}
