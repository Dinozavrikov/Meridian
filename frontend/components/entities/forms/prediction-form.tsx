"use client"
// frontend/components/entities/forms/prediction-form.tsx
//
// ЕДИНАЯ форма прогноза: страница прогнозов, вкладка лаборатории, AddForecastModal и quick-add
// используют её же. Отличия задаются пропами, а не копией кода:
//  - hyps — список гипотез для выбора (страница);
//  - lockedHypothesisId — гипотеза закреплена (AddForecastModal), выбор скрыт;
//  - lockedLabId — создание из лаборатории: выбора видимости нет, всегда lab_id этой лаборатории;
//  - header — слот сверху (чип родителя в quick-add / AddForecastModal);
//  - error / submitting — состояние отправки от вызывающего.
// Слайдер уверенности есть ВСЕГДА: прогноз без confidence выпадает из калибровки
// (calibration_source.py фильтрует NULL), а скрытое значение по умолчанию попадало бы в калибровку
// как осознанная оценка. Кирпичики (футер, ошибка, поле с редактором) — в form-parts.tsx.
import { useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react"
import { format } from "date-fns"
import { useT } from "@/lib/i18n/useT"
import { useDynamicTranslate } from "@/lib/i18n/useDynamicT"
import { Input, Textarea } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { VisibilitySelect } from "@/components/ui/visibility-select"
import { EntityLinkPicker } from "@/components/entities/entity-link-picker"
import { LocalImagePicker } from "@/components/entities/images-tab"
import {
  FIELD_LABEL_STYLE, FormError, FormFooter, LabLockedNote, RichTextField,
  useRequiredRichText, useSubmitExtras,
} from "@/components/entities/forms/form-parts"
import { PREDICTION_STATUSES, OPEN_PREDICTION_STATUS, isClosedPrediction } from "@/lib/prediction-status"
import { applyLabLock, initialVisibilityFields, isLabLocked } from "@/lib/lab-lock"
import type { EntitySubmit } from "@/lib/entity-submit"

const DEFAULT_CONFIDENCE = 50

interface PredictionFormProps {
  initial?: any
  onSave: (v: EntitySubmit) => void
  onCancel: () => void
  labs?: { id: number; name: string }[]
  hyps?: { id: number; name: string }[]
  lockedHypothesisId?: number | null
  lockedLabId?: number | null
  header?: ReactNode
  showLinkPicker?: boolean
  submitting?: boolean
  error?: string | null
}

export function PredictionForm({
  initial, onSave, onCancel, labs = [], hyps, lockedHypothesisId = null, lockedLabId = null,
  header, showLinkPicker = true, submitting = false, error = null,
}: PredictionFormProps) {
  const t = useT()
  const dt = useDynamicTranslate(PREDICTION_STATUSES, { noYo: true })
  const locked = isClosedPrediction(initial?.status)   // закрытый: исход и уверенность не редактируются
  const showHypSelect = hyps !== undefined && lockedHypothesisId == null

  const [form, setForm] = useState({
    title: initial?.title ?? "", text: initial?.text ?? "",
    date_created: initial?.date_created ?? format(new Date(), "yyyy-MM-dd"),
    expected_check_date: initial?.expected_check_date ? format(new Date(initial.expected_check_date), "yyyy-MM-dd'T'HH:mm") : "",
    hypothesis_id: initial?.hypothesis_id != null ? String(initial.hypothesis_id) : "",
    status: initial?.status ?? OPEN_PREDICTION_STATUS, result_notes: initial?.result_notes ?? "",
    confidence: initial?.confidence ?? DEFAULT_CONFIDENCE,
    confirms_hypothesis_if_true: initial?.confirms_hypothesis_if_true ?? true,
    ...initialVisibilityFields(initial, lockedLabId),
  })
  const f = (k: string) => (e: any) => setForm(p => ({ ...p, [k]: e.target.value }))

  const extras = useSubmitExtras()
  const text = useRequiredRichText(form.text)
  // Направление (стресс-тест) уходит на сервер, только если оно известно: пришло с записью или
  // пользователь его выбрал. Иначе при правке запись молча сбросилась бы в «подтверждает».
  const dirTouched = useRef(false)

  const effectiveHypId: number | null = lockedHypothesisId ?? (form.hypothesis_id ? Number(form.hypothesis_id) : null)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (text.isEmpty) { text.markAttempted(); return }
    const sendDirection = !initial || initial.confirms_hypothesis_if_true !== undefined || dirTouched.current
    onSave({
      data: applyLabLock({
        title: form.title, text: form.text, date_created: form.date_created,
        expected_check_date: form.expected_check_date ? new Date(form.expected_check_date).toISOString() : null,
        hypothesis_id: effectiveHypId,
        status: form.status, result_notes: form.result_notes,
        // закрытому уверенность не меняем (сервер отклонит), в т.ч. когда она была NULL
        confidence: locked ? (initial?.confidence ?? null) : Number(form.confidence),
        ...(sendDirection ? { confirms_hypothesis_if_true: form.confirms_hypothesis_if_true } : {}),
        visibility: form.visibility,
        lab_id: form.lab_id,
      }, lockedLabId),
      links: extras.links, images: extras.images, pendingFiles: extras.pendingFilesRef.current,
    })
  }

  const setDirection = (v: boolean) => { dirTouched.current = true; setForm(p => ({ ...p, confirms_hypothesis_if_true: v })) }
  const dirBtn = (active: boolean, color: string): CSSProperties => ({
    flex: 1, fontSize: 12, padding: "8px 12px", borderRadius: 8, cursor: "pointer",
    border: `1px solid ${active ? color : "#242430"}`,
    background: active ? `${color}14` : "transparent",
    color: active ? color : "#9999ad",
  })

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {header}
      <Input label={t("predictions.titleLabel")} placeholder={t("predictions.titlePlaceholder")} value={form.title} onChange={f("title")} />
      <RichTextField label={t("predictions.textLabel")} value={form.text} onChange={html => setForm(p => ({ ...p, text: html }))}
        entityType="prediction" entityId={initial?.id ?? null} placeholder={t("predictions.textPlaceholder")}
        pendingFilesRef={extras.pendingFilesRef} showRequiredError={text.showError} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Input label={t("predictions.dateCreatedLabel")} type="date" value={form.date_created} onChange={f("date_created")} />
        <Input label={t("predictions.checkDateLabel")} type="datetime-local" value={form.expected_check_date} onChange={f("expected_check_date")} required />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: showHypSelect ? "1fr 1fr" : "1fr", gap: 12 }}>
        {showHypSelect && (
          <Select label={t("predictions.hypothesisLabel")} value={form.hypothesis_id} onChange={f("hypothesis_id")}
            disabled={locked} options={[{ value: "", label: t("predictions.noHypothesis") }, ...hyps!.map(h => ({ value: String(h.id), label: h.name }))]} />
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={FIELD_LABEL_STYLE}>{t("field.status")}</label>
          <div style={{ fontSize: 13, color: "#f2efe9" }}>{dt(form.status)}</div>
          <div style={{ fontSize: 11, color: "#9095a9" }}>{locked ? t("predictions.statusLockedHint") : t("predictions.statusOpenHint")}</div>
        </div>
      </div>
      <div>
        <label style={{ ...FIELD_LABEL_STYLE, display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <span>{t("predictions.confidenceQuestion")}</span>
          <span style={{ color: "#4dcfa6", fontWeight: 700 }}>{form.confidence}%</span>
        </label>
        <input type="range" min={0} max={100} step={5} disabled={locked}
          value={form.confidence}
          onChange={e => setForm(p => ({ ...p, confidence: Number(e.target.value) }))}
          style={{ width: "100%", accentColor: "#4dcfa6", opacity: locked ? 0.5 : 1 }} />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#9095a9", marginTop: 2 }}>
          <span>{t("predictions.confidenceLow")}</span>
          <span>{t("predictions.confidenceMid")}</span>
          <span>{t("predictions.confidenceHigh")}</span>
        </div>
      </div>
      {locked && <div style={{ fontSize: 11, color: "#9095a9", marginTop: -8 }}>{t("predictions.confidenceLockedHint")}</div>}
      {locked && showHypSelect && <div style={{ fontSize: 11, color: "#9095a9", marginTop: -8 }}>{t("predictions.hypothesisLockedHint")}</div>}
      {effectiveHypId != null && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label style={FIELD_LABEL_STYLE}>{t("predictions.directionLabel")}</label>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={() => setDirection(true)} style={dirBtn(form.confirms_hypothesis_if_true, "#27AE60")}>{t("predictions.directionConfirms")}</button>
            <button type="button" onClick={() => setDirection(false)} style={dirBtn(!form.confirms_hypothesis_if_true, "#E74C3C")}>{t("predictions.directionRefutes")}</button>
          </div>
          <div style={{ fontSize: 11, color: "#9999a9", lineHeight: 1.4 }}>
            {form.confirms_hypothesis_if_true ? t("predictions.directionConfirmsHint") : t("predictions.directionRefutesHint")}
          </div>
        </div>
      )}
      <Textarea label={t("predictions.resultLabel")} placeholder={t("predictions.resultPlaceholder")} value={form.result_notes} onChange={f("result_notes")} rows={3} />
      {isLabLocked(lockedLabId) ? <LabLockedNote labId={lockedLabId} /> : (
        <VisibilitySelect
          value={form.visibility}
          onChange={v => setForm(p => ({ ...p, visibility: v, lab_id: v === "lab" ? p.lab_id : null }))}
          labId={form.lab_id}
          onLabChange={id => setForm(p => ({ ...p, lab_id: id }))}
          labs={labs}
          accent="#F5A623"
        />
      )}
      {showLinkPicker && <EntityLinkPicker value={extras.links} onChange={extras.setLinks} excludeType="prediction" excludeId={initial?.id} />}
      <LocalImagePicker value={extras.images} onChange={extras.setImages} />
      <FormError error={error} />
      <FormFooter onCancel={onCancel} submitting={submitting} />
    </form>
  )
}
