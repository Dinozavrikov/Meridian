"use client"
// frontend/components/entities/forms/observation-form.tsx
//
// ЕДИНАЯ форма наблюдения: страница наблюдений, вкладка лаборатории и quick-add используют её же.
// Отличия задаются пропами, а не копией кода:
//  - lockedLabId — создание из лаборатории: выбора видимости нет, всегда lab_id этой лаборатории
//    (итоговую видимость определяет бэкенд, см. lib/lab-lock.ts);
//  - header — слот сверху (чип родителя и тип связи в quick-add);
//  - showLinkPicker — выбор связей с другими сущностями;
//  - error / submitting — состояние отправки от вызывающего.
// Кирпичики (футер, ошибка, поле с редактором, статусы) — в form-parts.tsx.
import { useState, type FormEvent, type ReactNode } from "react"
import { format } from "date-fns"
import { useT } from "@/lib/i18n/useT"
import { useDynamicTranslate } from "@/lib/i18n/useDynamicT"
import { useStore } from "@/lib/store"
import { Input } from "@/components/ui/input"
import { Ruler } from "@/components/ui/ruler"
import { VisibilitySelect } from "@/components/ui/visibility-select"
import { EntityLinkPicker } from "@/components/entities/entity-link-picker"
import { LocalImagePicker } from "@/components/entities/images-tab"
import {
  FIELD_LABEL_STYLE, FormError, FormFooter, LabLockedNote, RichTextField, StatusPills,
  useRequiredRichText, useSubmitExtras,
} from "@/components/entities/forms/form-parts"
import { DEFAULT_SCALES } from "@/lib/scales"
import { OBSERVATION_STATUSES, DEFAULT_OBSERVATION_STATUS } from "@/lib/observation-constants"
import { applyLabLock, initialVisibilityFields, isLabLocked } from "@/lib/lab-lock"
import type { EntitySubmit } from "@/lib/entity-submit"

const ACCENT = "#1ABC9C"
const IMPORTANCE_SCALE = DEFAULT_SCALES.find(s => s.id === "importance" && s.entity_type === "observation")!

interface ObservationFormProps {
  initial?: any
  onSave: (v: EntitySubmit) => void
  onCancel: () => void
  labs?: { id: number; name: string }[]
  lockedLabId?: number | null
  header?: ReactNode
  showLinkPicker?: boolean
  submitting?: boolean
  error?: string | null
}

export function ObservationForm({
  initial, onSave, onCancel, labs = [], lockedLabId = null, header, showLinkPicker = true, submitting = false, error = null,
}: ObservationFormProps) {
  const t = useT()
  const dt = useDynamicTranslate(OBSERVATION_STATUSES, { noYo: true })
  const user = useStore(s => s.user)
  const authorValue = initial?.author ?? user?.display_name ?? user?.username ?? ""

  const [form, setForm] = useState({
    date: initial?.date ?? format(new Date(), "yyyy-MM-dd"),
    title: initial?.title ?? "", text: initial?.text ?? "",
    tags: (initial?.tags ?? []).join(", "),
    status: initial?.status ?? DEFAULT_OBSERVATION_STATUS,
    importance: initial?.importance ?? null,  // null = «не оценено»
    ...initialVisibilityFields(initial, lockedLabId),
  })
  const f = (k: string) => (e: any) => setForm(p => ({ ...p, [k]: e.target.value }))

  const extras = useSubmitExtras()
  const text = useRequiredRichText(form.text)
  const [titleAttempted, setTitleAttempted] = useState(false)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!form.title.trim() || text.isEmpty) { setTitleAttempted(true); text.markAttempted(); return }
    onSave({
      data: applyLabLock({
        ...form,
        title: form.title.trim(),
        author: authorValue,
        tags: form.tags.split(",").map((s: string) => s.trim()).filter(Boolean),
      }, lockedLabId),
      links: extras.links,
      images: extras.images,
      pendingFiles: extras.pendingFilesRef.current,
    })
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {header}
      <Input label={t("observations.dateLabel")} type="date" value={form.date} onChange={f("date")} required />
      <Input label={t("observations.titleLabel")} placeholder={t("observations.titlePlaceholder")} value={form.title} onChange={f("title")}
        error={titleAttempted && !form.title.trim() ? t("field.titleRequired") : undefined} />
      <RichTextField label={t("observations.textLabel")} value={form.text} onChange={html => setForm(p => ({ ...p, text: html }))}
        entityType="observation" entityId={initial?.id ?? null} placeholder={t("observations.textPlaceholder")}
        pendingFilesRef={extras.pendingFilesRef} showRequiredError={text.showError} />
      <Input label={t("hypotheses.tagsLabel")} placeholder={t("observations.tagsPlaceholder")} value={form.tags} onChange={f("tags")} />
      <StatusPills statuses={OBSERVATION_STATUSES} value={form.status} onChange={s => setForm(p => ({ ...p, status: s }))} translate={dt} accent={ACCENT} />
      <div>
        <div style={{ ...FIELD_LABEL_STYLE, marginBottom: 8 }}>{t("observations.importanceHeading")}</div>
        <Ruler name={t("observations.importanceLabel")} value={form.importance} min={0} max={5} levels={IMPORTANCE_SCALE.levels} color={ACCENT} onChange={v => setForm(p => ({ ...p, importance: v }))} />
      </div>
      {isLabLocked(lockedLabId) ? <LabLockedNote labId={lockedLabId} /> : (
        <VisibilitySelect
          value={form.visibility}
          onChange={v => setForm(p => ({ ...p, visibility: v }))}
          labId={form.lab_id}
          onLabChange={id => setForm(p => ({ ...p, lab_id: id }))}
          labs={labs}
          accent={ACCENT}
        />
      )}
      {showLinkPicker && <EntityLinkPicker value={extras.links} onChange={extras.setLinks} excludeType="observation" excludeId={initial?.id} />}
      <LocalImagePicker value={extras.images} onChange={extras.setImages} />
      <FormError error={error} />
      <FormFooter onCancel={onCancel} submitting={submitting} />
    </form>
  )
}
