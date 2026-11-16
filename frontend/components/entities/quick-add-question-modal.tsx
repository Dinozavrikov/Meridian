"use client"
import { useState, useRef } from "react"
import { format } from "date-fns"
import { HelpCircle } from "lucide-react"
import { questionApi, imageApi, resolveMediaUrl } from "@/lib/api"
import { useMyLabs } from "@/lib/use-my-labs"
import { Modal } from "@/components/ui/modal"
import { Input } from "@/components/ui/input"
import { RichTextEditor } from "@/components/entities/rich-text-editor"
import { Select } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { VisibilitySelect } from "@/components/ui/visibility-select"
import { QuickAddHeader } from "@/components/entities/forms/quick-add-header"
import { useQuickCreateAndLink } from "@/lib/use-quick-create-and-link"
import { useT } from "@/lib/i18n/useT"
import { useDynamicTranslate } from "@/lib/i18n/useDynamicT"
import { typeColor } from "@/lib/theme"
import { STATUSES, PRIORITIES } from "@/app/(app)/questions/page"

// Статусы/приоритеты импортируются из questions/page.tsx — раньше здесь был
// свой, более узкий и рассинхронизированный набор (см. Этап 8, найдено при
// аудите): "закрыт" не соответствовал ничему в полном наборе статусов формы
// редактирования, тихо превращаясь в "открыт" при открытии на редактирование
// (bare <select> без совпадающего value молча выбирает первую опцию).
// Один источник правды вместо двух словарей для одной сущности.

interface QuickAddQuestionModalProps {
  open: boolean; onClose: () => void
  targetType: string; targetId: number; targetLabel: string
  onCreated?: (q: any) => void
  labId?: number | null
}

function emptyForm(labId?: number | null) {
  return { title: "", text: "", status: "открыт", priority: "средний", date_created: format(new Date(), "yyyy-MM-dd"), visibility: (labId ? "lab" : "private") as string, lab_id: labId ?? null as number | null }
}

export function QuickAddQuestionModal({ open, onClose, targetType, targetId, targetLabel, onCreated, labId }: QuickAddQuestionModalProps) {
  const t = useT()
  const dtStatus = useDynamicTranslate(STATUSES)
  const dtPriority = useDynamicTranslate(PRIORITIES)
  const { data: labs = [] } = useMyLabs(open)
  const [form, setForm] = useState(() => emptyForm(labId))
  const [linkType, setLinkType] = useState("связано")
  const pendingFilesRef = useRef<Map<string, File>>(new Map())
  const f = (k: keyof ReturnType<typeof emptyForm>) => (e: any) => setForm(p => ({ ...p, [k]: e.target.value }))
  const reset = () => { setForm(emptyForm(labId)); setLinkType("связано") }
  const handleClose = () => { reset(); onClose() }

  const create = useQuickCreateAndLink({
    entityType: "question",
    create: async (body: any) => {
      const created = await questionApi.create(body)
      if (pendingFilesRef.current.size > 0) {
        let newText = created.text ?? ""
        for (const [blobUrl, file] of pendingFilesRef.current) {
          const uploaded = await imageApi.upload("question", created.id, [file])
          const url = resolveMediaUrl(uploaded?.[0]?.url)
          if (url) newText = newText.split(blobUrl).join(url)
          URL.revokeObjectURL(blobUrl)
        }
        if (newText !== (created.text ?? "")) {
          await questionApi.update(created.id, { ...created, tags: created.tags ?? [], text: newText })
        }
      }
      return created
    },
    target: { type: targetType, id: targetId },
    linkType,
    invalidateKeys: [["questions"]],
    onSuccess: (created) => { onCreated?.(created); handleClose() },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    create.mutate({ ...form, tags: [] })
  }

  return (
    <Modal open={open} onClose={handleClose} title={t("actions.addQuestion")} size="lg">
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <QuickAddHeader entityType="question" targetType={targetType} targetLabel={targetLabel} icon={HelpCircle} linkType={linkType} onLinkTypeChange={setLinkType} />
        <Input label={t("quickAddQuestion.questionLabel")} placeholder={t("quickAddQuestion.questionPlaceholder")} value={form.title} onChange={f("title")} required />
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 12, color: "#9393b5" }}>{t("scalesPage.description")}</label>
          <RichTextEditor value={form.text} onChange={html => setForm(p => ({ ...p, text: html }))}
            entityType="question" entityId={null} placeholder={t("quickAddQuestion.descriptionPlaceholder")}
            onPendingFileAdded={(url, file) => pendingFilesRef.current.set(url, file)} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Select label={t("quickAddQuestion.statusLabel")} value={form.status} onChange={f("status")} options={STATUSES.map(s => ({ value: s, label: dtStatus(s) }))} />
          <Select label={t("quickAddQuestion.priorityLabel")} value={form.priority} onChange={f("priority")} options={PRIORITIES.map(s => ({ value: s, label: dtPriority(s) }))} />
        </div>
        <VisibilitySelect value={form.visibility} onChange={v => setForm(p => ({ ...p, visibility: v }))} labId={form.lab_id} onLabChange={id => setForm(p => ({ ...p, lab_id: id }))} labs={labs} accent={typeColor.question} />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Button type="button" variant="ghost" onClick={handleClose}>{t("actions.cancel")}</Button>
          <Button type="submit" variant="primary" disabled={create.isPending}>{t("actions.save")}</Button>
        </div>
      </form>
    </Modal>
  )
}
