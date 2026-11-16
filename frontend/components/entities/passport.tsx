"use client"
import React, { useState } from "react"
import { ChevronDown, SlidersHorizontal } from "lucide-react"
import { useT } from "@/lib/i18n/useT"
import { useDynamicTranslate } from "@/lib/i18n/useDynamicT"
import { collectStrings } from "@/lib/i18n/collect-strings"
import { useEntityScales, useScaleValues } from "@/lib/use-scales"
import { useEntityStage } from "@/lib/use-entity-stage"
import { STAGE_VALUES, type StageValue } from "@/lib/stage-labels"
import { DEFAULT_SCALES, translateScale, isClearableScale } from "@/lib/scales"
import { getLockedScaleIds } from "@/lib/scale-locks"
import { ScaleEditModal } from "@/components/entities/scale-edit-modal"
import { PassportScale, formatValue } from "@/components/entities/passport-scale"
import { StageTrack } from "@/components/entities/stage-track"
import { PassportVisibility } from "@/components/entities/passport-visibility"
import { ink } from "@/lib/theme"

export interface PassportMeta { label: string; node: React.ReactNode }

interface EntityPassportProps {
  entityType: string
  entityId: number
  /** сама сущность: встроенные шкалы лежат в её полях */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- значения встроенных шкал: поля сущности любого типа
  values: Record<string, any>
  /** сохранение встроенных шкал (патч полей сущности); null — «не оценено» */
  onSave: (patch: Record<string, number | null>) => void
  isPending?: boolean
  // Пока нет формулы по голосам всех пользователей, шкалы меняет только владелец
  // (backend/app/api/v1/scales.py set_value); остальные видят значения без интерактива.
  isOwner: boolean
  accent?: string
  /** свойства записи: статус, видимость, автор (узлы приходят со страницы типа) */
  meta?: PassportMeta[]
  /** true — сворачиваемая карточка над вкладками (узкая панель), false — боковая панель */
  compact?: boolean
}

const label: React.CSSProperties = { fontSize: 12, color: ink.label }
const divider: React.CSSProperties = { borderTop: `1px solid ${ink.line}` }

function StageReadout({ entityType, entityId }: { entityType: string; entityId: number }) {
  const t = useT()
  const { stage } = useEntityStage(entityType, entityId)
  const idx = stage ? STAGE_VALUES.indexOf(stage as StageValue) : -1
  return (
    <div>
      <div style={label}>{t("stagePanel.modalTitle")}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: idx >= 0 ? ink.label : ink.muted }}>{idx >= 0 ? `${idx + 1}/${STAGE_VALUES.length}` : "—"}</div>
    </div>
  )
}

/** «Паспорт» записи: свойства, общие показатели (шкалы) и путь по стадиям. */
export function EntityPassport({
  entityType, entityId, values, onSave, isPending, isOwner, accent = "#4A90D9", meta = [], compact = false,
}: EntityPassportProps) {
  const t = useT()
  const dt = useDynamicTranslate(collectStrings(DEFAULT_SCALES))
  const [editOpen, setEditOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const { scales, isLoading } = useEntityScales(entityType)
  const { values: allValues, setCustomValue, isPending: customPending } = useScaleValues(entityType, entityId, values)
  const lockedIds = getLockedScaleIds(entityType, values)

  const hasScales = !isLoading && scales.length > 0
  const metaRows = meta.filter(m => m.node != null)
  // Видимость есть у каждой записи: строку добавляем здесь, чтобы страницы типов не копировали логику.
  // Если страница передала свою (наблюдения: бейдж открывает публикацию), автоматическую не добавляем.
  const visLabel = t("passport.visibility")
  if (typeof values.visibility === "string" && !meta.some(m => m.label === visLabel)) {
    metaRows.splice(Math.min(1, metaRows.length), 0, {
      label: visLabel,
      node: <PassportVisibility entityType={entityType} entityId={entityId} visibility={values.visibility} labId={values.lab_id ?? null} isOwner={isOwner} accent={accent} />,
    })
  }
  const builtinIds = new Set(scales.filter(s => s.builtin).map(s => s.id))
  const write = (scaleId: string, value: number | null) =>
    builtinIds.has(scaleId) ? onSave({ [scaleId]: value }) : setCustomValue(scaleId, value)
  const translated = scales.map(raw => ({ raw, scale: translateScale(raw, dt) }))

  const scalesBlock = hasScales && (
    <div style={{ display: "grid", gap: 20, gridTemplateColumns: compact ? "repeat(auto-fill, minmax(min(220px, 100%), 1fr))" : "minmax(0, 1fr)" }}>
      {translated.map(({ raw, scale }) => {
        const locked = lockedIds.has(raw.id)
        const editable = isOwner && !locked
        return (
          <PassportScale
            key={raw.id} scale={scale} value={allValues[raw.id]}
            locked={locked} lockedHint={t("scales.lockedHint")}
            onChange={editable ? v => write(raw.id, v) : undefined}
            onClear={editable && isClearableScale(raw) ? () => write(raw.id, null) : undefined}
          />
        )
      })}
    </div>
  )

  const editButton = isOwner && hasScales && (
    <button
      type="button" onClick={() => setEditOpen(true)}
      aria-label={t("entityScales.editButton")} title={t("entityScales.editButton")}
      style={{
        width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        borderRadius: 8, border: `1px solid ${ink.line}`, background: "transparent", color: ink.label, cursor: "pointer",
      }}
    >
      <SlidersHorizontal size={14} />
    </button>
  )

  const editModal = isOwner && hasScales && (
    <ScaleEditModal
      open={editOpen} onClose={() => setEditOpen(false)}
      scales={scales} values={allValues} lockedIds={lockedIds}
      onSave={patch => Object.entries(patch).forEach(([k, v]) => write(k, v))}
      isPending={isPending || customPending}
    />
  )

  const stageBlock = <div style={{ ...divider, paddingTop: 16 }}><StageTrack entityType={entityType} entityId={entityId} isOwner={isOwner} accent={accent} /></div>
  const ownerNote = !isOwner && hasScales && <div style={{ fontSize: 12, color: ink.muted }}>{t("ownership.editOwnerOnly")}</div>

  if (!compact) {
    return (
      <section aria-label={t("passport.title")} style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: accent }}>{t("passport.title")}</span>
          {editButton}
        </div>
        {metaRows.length > 0 && (
          <div>
            {metaRows.map(m => (
              <div key={m.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, minHeight: 36 }}>
                <span style={label}>{m.label}</span>
                <span style={{ minWidth: 0, display: "flex", justifyContent: "flex-end" }}>{m.node}</span>
              </div>
            ))}
          </div>
        )}
        {hasScales && <div style={{ ...divider, paddingTop: 16, display: "flex", flexDirection: "column", gap: 16 }}>{scalesBlock}{ownerNote}</div>}
        {stageBlock}
        {editModal}
      </section>
    )
  }

  return (
    <section aria-label={t("passport.title")} style={{
      minWidth: 0, background: ink.card, border: `1px solid ${ink.line}`, borderRadius: 12, padding: 14,
      boxShadow: `inset 0 1px 0 ${accent}33`, ["--passport-bg" as string]: ink.card,
    } as React.CSSProperties}>
      {metaRows.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: 12 }}>
          {metaRows.map(m => <span key={m.label} style={{ minWidth: 0 }}>{m.node}</span>)}
        </div>
      )}
      <button
        type="button" aria-expanded={expanded} onClick={() => setExpanded(v => !v)}
        aria-label={expanded ? t("passport.collapse") : t("passport.expand")}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
          padding: "8px 0", background: "transparent", border: "none", textAlign: "left", cursor: "pointer", color: ink.label,
        }}
      >
        <span style={{ display: "flex", flexWrap: "wrap", gap: "8px 20px", minWidth: 0 }}>
          {translated.map(({ raw, scale }) => {
            const v = allValues[raw.id]
            return (
              <span key={raw.id}>
                <span style={{ ...label, display: "block" }}>{scale.name}</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: v != null ? scale.color : ink.muted, fontStyle: v != null ? "normal" : "italic" }}>
                  {v != null ? formatValue(v, scale.max) : t("passport.unrated")}
                </span>
              </span>
            )
          })}
          <StageReadout entityType={entityType} entityId={entityId} />
        </span>
        <ChevronDown size={18} aria-hidden style={{ flexShrink: 0, transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
      </button>
      {expanded && (
        <div style={{ ...divider, marginTop: 8, paddingTop: 16, display: "flex", flexDirection: "column", gap: 16 }}>
          {hasScales && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: accent }}>{t("passport.title")}</span>
              {editButton}
            </div>
          )}
          {scalesBlock}{ownerNote}
          {stageBlock}
        </div>
      )}
      {editModal}
    </section>
  )
}
