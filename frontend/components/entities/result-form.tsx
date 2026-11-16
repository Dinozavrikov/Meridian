"use client"
// Компактная форма создания/редактирования Result — в отличие от HypForm
// (гипотезы), у Result нет собственных шкал/тегов/дат создания: это
// синтезированный документ (title + body), lab_id всегда фиксирован извне
// (лаба, в которой создаётся), visibility ограничена набором "private"/"lab"
// (см. _resolve_result_visibility в results.py — публичность отдельно,
// через is_published/publish, не через visibility="public").
import { useState, useRef } from "react"
import { Lock, Users, BookMarked, Link2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { RichTextEditor } from "@/components/entities/rich-text-editor"
import { ResultSourcePicker } from "@/components/labs/result-source-picker"
import { useT } from "@/lib/i18n/useT"

const ACCENT = "#4A90D9"

export function ResultForm({ initial, onSave, onCancel, resultId, labIsPublic, labId }: any) {
  const t = useT()
  const [form, setForm] = useState({
    title:      initial?.title      ?? "",
    body:       initial?.body       ?? "",
    visibility: initial?.visibility ?? "private",
  })
  const [saving, setSaving] = useState(false)
  const pendingFilesRef = useRef<Map<string, File>>(new Map())
  const [selectedSourceIds, setSelectedSourceIds] = useState<Set<number>>(new Set())
  const [showSourcePicker, setShowSourcePicker] = useState(false)
  const toggleSource = (sourceId: number) => setSelectedSourceIds(prev => {
    const next = new Set(prev)
    if (next.has(sourceId)) next.delete(sourceId)
    else next.add(sourceId)
    return next
  })
  const f = (k: string) => (e: any) => setForm(p => ({ ...p, [k]: e.target.value }))

  const handleSubmit = async (e: any) => {
    e.preventDefault()
    setSaving(true)
    try {
      await onSave(form, pendingFilesRef.current, selectedSourceIds)
    } finally {
      setSaving(false)
    }
  }

  const visOptions = [
    { value: "private", label: t("visibility.private"), icon: Lock, color: "#E74C3C" },
    { value: "lab",     label: t("visibility.lab"),      icon: Users, color: ACCENT },
  ]

  return (
    <form onSubmit={handleSubmit}
      style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Input label={t("results.titleLabel")} placeholder={t("results.titlePlaceholder")}
        value={form.title} onChange={f("title")} required />
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label style={{ fontSize: 12, color: "#9696a1" }}>{t("results.bodyLabel")}</label>
        <RichTextEditor value={form.body} onChange={html => setForm(p => ({ ...p, body: html }))}
          entityType="result" entityId={resultId ?? null} placeholder={t("results.bodyPlaceholder")}
          onPendingFileAdded={(url, file) => pendingFilesRef.current.set(url, file)} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <label style={{ fontSize: 12, color: "#9696a1" }}>{t("field.visibility")}</label>
        <div style={{ display: "flex", gap: 8 }}>
          {visOptions.map(({ value: v, label, icon: Icon, color }) => (
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
        {form.visibility === "lab" && (
          <div style={{ fontSize: 10.5, color: "#888894", lineHeight: 1.4 }}>
            {labIsPublic ? t("results.visLabHintPublic") : t("results.visLabHintPrivate")}
          </div>
        )}
      </div>

      {labId != null && (
        <div style={{ display: "flex", flexDirection: "column", gap: 9, padding: 12, borderRadius: 10, border: "1px solid #232338", background: "#0a0a14" }}>
          <label style={{ fontSize: 12.5, color: "#8a8aa5", display: "flex", alignItems: "center", gap: 6, fontWeight: 600 }}>
            <BookMarked size={14} /> {t("results.sourcesLabel")}
          </label>
          <div style={{ fontSize: 10.5, color: "#888894", lineHeight: 1.4 }}>
            {t("results.sourcesFormHint")}
          </div>
          <button type="button" onClick={() => setShowSourcePicker(true)}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
              padding: 10, borderRadius: 8, cursor: "pointer", width: "100%",
              background: selectedSourceIds.size > 0 ? "#4A90D91c" : "transparent",
              border: `1px dashed ${selectedSourceIds.size > 0 ? "#4A90D9" : "#4A90D960"}`,
              color: "#4A90D9", fontSize: 11.5, fontWeight: 600,
            }}>
            <Link2 size={13} />
            {selectedSourceIds.size > 0
              ? `${t("results.sourceSelected")}: ${selectedSourceIds.size}`
              : t("results.sourcesFormAttachButton")}
          </button>
          <ResultSourcePicker labId={labId} open={showSourcePicker} onClose={() => setShowSourcePicker(false)}
            selectedIds={selectedSourceIds} onToggleSelect={toggleSource} />
        </div>
      )}

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>{t("actions.cancel")}</Button>
        <Button type="submit" variant="primary" disabled={saving}>{saving ? t("settings.saving") : t("actions.save")}</Button>
      </div>
    </form>
  )
}
