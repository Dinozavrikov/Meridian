"use client"
// Полная форма создания/редактирования гипотезы — вынесена из
// hypotheses/page.tsx, чтобы её мог переиспользовать любой контекст (страница
// гипотез, "Предложить гипотезу" в лабе и т.д.), а не дублировать поля/шкалы/
// falsification-логику в каждом отдельном месте заново.
import { useState } from "react"
import { format } from "date-fns"
import { Input, Textarea } from "@/components/ui/input"
import { EntityLinkPicker } from "@/components/entities/entity-link-picker"
import { LocalImagePicker } from "@/components/entities/images-tab"
import { TagCalibrationHint } from "@/components/entities/tag-calibration-hint"
import { getVisibilityOptions } from "@/lib/visibility-levels"
import { HYPOTHESIS_STATUSES } from "@/lib/hypothesis-constants"
import { FormError, FormFooter, LabLockedNote, RichTextField, useSubmitExtras } from "@/components/entities/forms/form-parts"
import { applyLabLock, initialVisibilityFields, isLabLocked } from "@/lib/lab-lock"
import { useT } from "@/lib/i18n/useT"
import { useDynamicTranslate } from "@/lib/i18n/useDynamicT"

const ACCENT = "#4A90D9"

export function getMaturity(t: (key: string) => string) {
  return [
    { label: t("maturity.0"), short: "0", color: "#9696aa" },
    { label: t("maturity.1"), short: "1", color: "#5566aa" },
    { label: t("maturity.2"), short: "2", color: "#4477cc" },
    { label: t("maturity.3"), short: "3", color: "#3388dd" },
    { label: t("maturity.4"), short: "4", color: "#2299ee" },
  ]
}

export function HypForm({ initial, onSave, onCancel, labs, hideLinksAndImages, lockedLabId = null, header, submitting = false, error = null }: any) {
  const t = useT()
  const dt = useDynamicTranslate(HYPOTHESIS_STATUSES, { noYo: true })
  const today = format(new Date(), "yyyy-MM-dd")
  const [form, setForm] = useState({
    name:         initial?.name         ?? "",
    description:  initial?.description  ?? "",
    falsification_criteria: initial?.falsification_criteria ?? "",
    date_created: initial?.date_created ?? today,
    status:       initial?.status       ?? "идея",
    maturity:     initial?.maturity     ?? 0,
    tags:         (initial?.tags ?? []).join(", "),
    ...initialVisibilityFields(initial, lockedLabId),
    stability:    initial?.stability    ?? 5,
    research_load:initial?.research_load?? 5,
    risk:         initial?.risk          ?? 5,
  })
  const extras = useSubmitExtras()   // связи, галерея и inline-картинки описания копятся до появления id
  const [falsificationWarning, setFalsificationWarning] = useState(false)
  const f = (k: string) => (e: any) => setForm(p => ({ ...p, [k]: e.target.value }))

  return (
    <form onSubmit={e => {
      e.preventDefault()
      if (!form.falsification_criteria.trim() && !falsificationWarning) {
        setFalsificationWarning(true)
        return
      }
      onSave({
        data: applyLabLock({
        ...form,
        maturity: +form.maturity,
        stability: +form.stability,
        research_load: +form.research_load,
        risk: +form.risk,
        tags: form.tags.split(",").map((t: string) => t.trim()).filter(Boolean),
        lab_id: form.lab_id,
      }, lockedLabId),
        links: extras.links, images: extras.images, pendingFiles: extras.pendingFilesRef.current,
      })
    }} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {header}
      <Input label={t("hypotheses.nameLabel")} placeholder={t("hypotheses.namePlaceholder")} value={form.name} onChange={f("name")} required />
      <RichTextField label={t("field.description")} value={form.description} onChange={html => setForm(p => ({ ...p, description: html }))}
        entityType="hypothesis" entityId={initial?.id ?? null} placeholder={t("hypotheses.descPlaceholder")}
        pendingFilesRef={extras.pendingFilesRef} />

      <div style={{ padding: "12px 14px", borderRadius: 8, background: "#131313", border: "1px solid #1c1c1c", borderLeft: `3px solid ${ACCENT}` }}>
        <label style={{ fontSize: 11, color: ACCENT, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6, display: "block", fontWeight: 700 }}>
          {t("hypotheses.falsificationLabel")}
        </label>
        <Textarea
          placeholder={t("hypotheses.falsificationPlaceholder")}
          value={form.falsification_criteria}
          onChange={e => { setFalsificationWarning(false); setForm(p => ({ ...p, falsification_criteria: e.target.value })) }}
          rows={2}
        />
        {falsificationWarning && (
          <div style={{ fontSize: 11, color: "#E7A33C", marginTop: 8, lineHeight: 1.5 }}>
            {t("hypotheses.falsificationWarning")}
          </div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Input label={t("hypotheses.dateLabel")} type="date" value={form.date_created} onChange={f("date_created")} />
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 12, color: "#9696a1" }}>{t("field.status")}</label>
          <select value={form.status} onChange={f("status")}
            style={{ background: "#0d0d18", border: "1px solid #1e1e2c", borderRadius: 8, padding: "8px 12px", color: "#c0c0d8", fontSize: 13, outline: "none" }}>
            {HYPOTHESIS_STATUSES.map(s => <option key={s} value={s}>{dt(s)}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <label style={{ fontSize: 12, color: "#9696a1" }}>
          {t("hypotheses.maturityLabel")} — <span style={{ color: ACCENT, fontWeight: 600 }}>{getMaturity(t)[+form.maturity]?.label}</span>
        </label>
        <div style={{ display: "flex", gap: 4 }}>
          {getMaturity(t).map((m, i) => (
            <button key={i} type="button" onClick={() => setForm(p => ({ ...p, maturity: i }))}
              style={{
                flex: 1, height: 28, borderRadius: 6, border: `1px solid ${i <= +form.maturity ? m.color + "60" : "#1a1a28"}`,
                background: i <= +form.maturity ? m.color + "22" : "#0d0d18",
                cursor: "pointer", transition: "all 0.15s",
                fontSize: 10, color: i <= +form.maturity ? m.color : "#9898a4", fontWeight: 600,
              }}>
              {i}
            </button>
          ))}
        </div>
      </div>

      <Input label={t("hypotheses.tagsLabel")} placeholder={t("hypotheses.tagsPlaceholder")} value={form.tags} onChange={f("tags")} />
      <TagCalibrationHint tagsRaw={form.tags} />

      {isLabLocked(lockedLabId) ? <LabLockedNote labId={lockedLabId} /> : (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <label style={{ fontSize: 12, color: "#9696a1" }}>{t("field.visibility")}</label>
        <div style={{ display: "flex", gap: 8 }}>
          {getVisibilityOptions(t, ACCENT).map(({ value: v, label, icon: Icon, color }) => (
            <button key={v} type="button" onClick={() => setForm(p => ({ ...p, visibility: v }))}
              style={{
                flex: 1, padding: "10px 8px", borderRadius: 9, cursor: "pointer",
                border: `1px solid ${form.visibility === v ? color + "50" : "#161626"}`,
                background: form.visibility === v ? color + "14" : "#06060c",
                color: form.visibility === v ? color : "#9c9cac",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                transition: "all 0.15s",
              }}>
              <Icon size={14} /><span style={{ fontSize: 10, fontWeight: form.visibility === v ? 600 : 400 }}>{label}</span>
            </button>
          ))}
        </div>
        {form.visibility === "lab" && labs.length > 0 && (
          <select value={form.lab_id ?? ""} onChange={e => setForm(p => ({ ...p, lab_id: e.target.value ? Number(e.target.value) : null }))}
            style={{ background: "#0d0d18", border: "1px solid #1e1e2c", borderRadius: 8, padding: "8px 12px", color: "#c0c0d8", fontSize: 13, outline: "none" }}>
            <option value="">{t("labs.selectLab")}</option>
            {labs.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        )}
      </div>
      )}

      {!hideLinksAndImages && (
        <>
          <EntityLinkPicker value={extras.links} onChange={extras.setLinks} excludeType="hypothesis" excludeId={initial?.id} />
          <LocalImagePicker value={extras.images} onChange={extras.setImages} />
        </>
      )}
      <FormError error={error} />
      <FormFooter onCancel={onCancel} submitting={submitting} />
    </form>
  )
}
