"use client"
// Создание задачи (ResearchTask) сразу привязанной к зафиксированному
// родителю через generic Link. Тип связи всегда "связано".
import { useState } from "react"
import { CheckSquare } from "lucide-react"
import { taskApi } from "@/lib/api"
import { useMyLabs } from "@/lib/use-my-labs"
import { Modal } from "@/components/ui/modal"
import { Input, Textarea } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { VisibilitySelect } from "@/components/ui/visibility-select"
import { LockedTargetChip } from "@/components/entities/locked-target-chip"
import { useQuickCreateAndLink } from "@/lib/use-quick-create-and-link"
import { useT } from "@/lib/i18n/useT"
import { typeColor } from "@/lib/theme"

interface QuickAddTaskModalProps {
  open: boolean; onClose: () => void
  targetType: string; targetId: number; targetLabel: string
  onCreated?: (task: any) => void
  labId?: number | null
}

function emptyForm(labId?: number | null) {
  return { name: "", description: "", visibility: (labId ? "lab" : "private") as string, lab_id: labId ?? null as number | null }
}

export function QuickAddTaskModal({ open, onClose, targetType, targetId, targetLabel, onCreated, labId }: QuickAddTaskModalProps) {
  const t = useT()
  const { data: labs = [] } = useMyLabs(open)
  const [form, setForm] = useState(() => emptyForm(labId))
  const f = (k: keyof ReturnType<typeof emptyForm>) => (e: any) => setForm(p => ({ ...p, [k]: e.target.value }))
  const reset = () => setForm(emptyForm(labId))
  const handleClose = () => { reset(); onClose() }

  const create = useQuickCreateAndLink({
    entityType: "task",
    create: (body: any) => taskApi.create(body),
    target: { type: targetType, id: targetId },
    linkType: "связано",
    invalidateKeys: [["tasks"]],
    onSuccess: (created) => { onCreated?.(created); handleClose() },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    create.mutate({ ...form })
  }

  return (
    <Modal open={open} onClose={handleClose} title={t("actions.addTask")} size="md">
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <LockedTargetChip label={t("relations.title")} value={targetLabel} icon={CheckSquare} accent={typeColor[targetType] ?? "#4A90D9"} />
        <Input label={t("field.name")} placeholder={t("tasks.namePlaceholder")} value={form.name} onChange={f("name")} required />
        <Textarea label={t("field.description")} placeholder={t("tasks.descPlaceholder")} value={form.description} onChange={f("description")} rows={4} />
        <VisibilitySelect value={form.visibility} onChange={v => setForm(p => ({ ...p, visibility: v }))} labId={form.lab_id} onLabChange={id => setForm(p => ({ ...p, lab_id: id }))} labs={labs} accent={typeColor.task} />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Button type="button" variant="ghost" onClick={handleClose}>{t("actions.cancel")}</Button>
          <Button type="submit" variant="primary" disabled={create.isPending}>{t("actions.save")}</Button>
        </div>
      </form>
    </Modal>
  )
}
