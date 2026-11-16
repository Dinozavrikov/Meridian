"use client"
// frontend/components/entities/forms/form-parts.tsx
//
// Общие кирпичики форм сущностей (ObservationForm, PredictionForm, дальше HypForm и новые):
// один вид подписей, футера, ошибки, поля с редактором и пилюль статуса, плюс хуки состояния,
// которое у всех форм одинаково (связи/картинки/inline-картинки и «текст обязателен»).
// Правка здесь меняет ВСЕ формы сразу — так и задумано (см. README.md рядом).
import { useRef, useState, type CSSProperties } from "react"
import { useT } from "@/lib/i18n/useT"
import { Button } from "@/components/ui/button"
import { RichTextEditor } from "@/components/entities/rich-text-editor"
import type { PendingLink } from "@/components/entities/entity-link-picker"
import { stripHtml } from "@/lib/strip-html"
import { useLabEntityVisibility } from "@/lib/use-lab-entity-visibility"

/** Подпись поля — как у Input и VisibilitySelect. */
export const FIELD_LABEL_STYLE: CSSProperties = { fontSize: 11, color: "#909090", fontWeight: 500 }

export function FormError({ error }: { error?: string | null }) {
  if (!error) return null
  return <div role="alert" style={{ fontSize: 12, color: "#E74C3C" }}>{error}</div>
}

export function FormFooter({ onCancel, submitting }: { onCancel: () => void; submitting?: boolean }) {
  const t = useT()
  return (
    <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", paddingTop: 12, borderTop: "1px solid #1e1e1e" }}>
      <Button type="button" variant="ghost" onClick={onCancel}>{t("actions.cancel")}</Button>
      <Button type="submit" variant="primary" disabled={submitting}>{t("actions.save")}</Button>
    </div>
  )
}

/** Вместо выбора видимости при создании из лаборатории (lockedLabId): видимость выводит бэкенд из
 *  публичности лаборатории (resolve_lab_attachment), поэтому форма честно говорит, что получится. */
export function LabLockedNote({ labId = null }: { labId?: number | null }) {
  const t = useT()
  const visibility = useLabEntityVisibility(labId)
  const text = visibility === "public" ? t("forms.lockedToLab.public")
    : visibility === "lab" ? t("forms.lockedToLab.lab") : t("forms.lockedToLab")
  const color = visibility === "public" ? "#E7A33C" : "#4A90D9"
  return (
    <div data-testid="lab-locked-note" style={{ fontSize: 11, color, padding: "8px 12px", borderRadius: 8, background: color + "12", border: `1px solid ${color}30` }}>
      {text}
    </div>
  )
}

interface RichTextFieldProps {
  label: string
  value: string
  onChange: (html: string) => void
  entityType: string
  entityId?: number | null
  placeholder?: string
  /** blob-url -> File для картинок, вставленных в текст до сохранения (см. useSubmitExtras). */
  pendingFilesRef: { current: Map<string, File> }
  showRequiredError?: boolean
}

export function RichTextField({ label, value, onChange, entityType, entityId = null, placeholder, pendingFilesRef, showRequiredError }: RichTextFieldProps) {
  const t = useT()
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={FIELD_LABEL_STYLE}>{label}</label>
      <RichTextEditor value={value} onChange={onChange} entityType={entityType} entityId={entityId} placeholder={placeholder}
        onPendingFileAdded={(url, file) => pendingFilesRef.current.set(url, file)} />
      {showRequiredError && <div style={{ fontSize: 11, color: "#E74C3C" }}>{t("field.textRequired")}</div>}
    </div>
  )
}

interface StatusPillsProps {
  statuses: string[]
  value: string
  onChange: (s: string) => void
  translate?: (s: string) => string
  accent?: string
}

export function StatusPills({ statuses, value, onChange, translate = s => s, accent = "#1ABC9C" }: StatusPillsProps) {
  const t = useT()
  return (
    <div>
      <div style={{ ...FIELD_LABEL_STYLE, marginBottom: 8 }}>{t("field.status")}</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {statuses.map(s => {
          const active = value === s
          return (
            <button key={s} type="button" onClick={() => onChange(s)}
              style={{ padding: "6px 14px", borderRadius: 7, border: `1px solid ${active ? accent + "60" : "#2a2a2a"}`, background: active ? accent + "14" : "#111", color: active ? accent : "#999999", cursor: "pointer", fontSize: 11, fontWeight: active ? 600 : 400, transition: "all 0.12s" }}>
              {translate(s)}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** Связи, галерея и inline-картинки: их можно создать только ПОСЛЕ появления id записи,
 *  поэтому копятся в форме и уходят в onSave рядом с телом (контракт EntitySubmit). */
export function useSubmitExtras() {
  const [links, setLinks] = useState<PendingLink[]>([])
  const [images, setImages] = useState<File[]>([])
  const pendingFilesRef = useRef<Map<string, File>>(new Map())
  return { links, setLinks, images, setImages, pendingFilesRef }
}

/** «Текст обязателен» для rich-полей: ошибка показывается только после первой попытки сохранить. */
export function useRequiredRichText(html: string) {
  const [attempted, setAttempted] = useState(false)
  const isEmpty = !stripHtml(html).trim()
  return { isEmpty, showError: attempted && isEmpty, markAttempted: () => setAttempted(true) }
}
