"use client"
// Создание убеждения сразу привязанного к зафиксированному родителю через
// generic Link. Тип связи всегда "связано" — убеждение не "подтверждает"
// и не "опровергает" в терминах шкалы confirms/refutes, это другая ось.
import { useState, useRef } from "react"
import { format } from "date-fns"
import { Compass } from "lucide-react"
import { wvApi, imageApi, resolveMediaUrl } from "@/lib/api"
import { useMyLabs } from "@/lib/use-my-labs"
import { Modal } from "@/components/ui/modal"
import { Input, Textarea } from "@/components/ui/input"
import { RichTextEditor } from "@/components/entities/rich-text-editor"
import { Button } from "@/components/ui/button"
import { VisibilitySelect } from "@/components/ui/visibility-select"
import { LockedTargetChip } from "@/components/entities/locked-target-chip"
import { useQuickCreateAndLink } from "@/lib/use-quick-create-and-link"
import { useT } from "@/lib/i18n/useT"
import { typeColor } from "@/lib/theme"
import { influenceOptions } from "@/lib/worldview-influence"

interface QuickAddWorldviewModalProps {
  open: boolean; onClose: () => void
  targetType: string; targetId: number; targetLabel: string
  onCreated?: (wv: any) => void
  labId?: number | null
}

function emptyForm(labId?: number | null) {
  return { date: format(new Date(), "yyyy-MM-dd"), belief: "", confirming_data: "", refuting_data: "", visibility: (labId ? "lab" : "private") as string, lab_id: labId ?? null as number | null }
}

export function QuickAddWorldviewModal({ open, onClose, targetType, targetId, targetLabel, onCreated, labId }: QuickAddWorldviewModalProps) {
  const t = useT()
  const { data: labs = [] } = useMyLabs(open)
  const [form, setForm] = useState(() => emptyForm(labId))
  const [influence, setInfluence] = useState<string>("strengthens")
  const pendingFilesRef = useRef<Map<string, File>>(new Map())
  const f = (k: keyof ReturnType<typeof emptyForm>) => (e: any) => setForm(p => ({ ...p, [k]: e.target.value }))
  const reset = () => { setForm(emptyForm(labId)); setInfluence("strengthens") }
  const handleClose = () => { reset(); onClose() }

  const create = useQuickCreateAndLink({
    entityType: "worldview",
    create: async (body: any) => {
      const created = await wvApi.create(body)
      if (pendingFilesRef.current.size > 0) {
        let newConfirming = created.confirming_data ?? ""
        let newRefuting = created.refuting_data ?? ""
        for (const [blobUrl, file] of pendingFilesRef.current) {
          const uploaded = await imageApi.upload("worldview", created.id, [file])
          const url = resolveMediaUrl(uploaded?.[0]?.url)
          if (url) {
            newConfirming = newConfirming.split(blobUrl).join(url)
            newRefuting = newRefuting.split(blobUrl).join(url)
          }
          URL.revokeObjectURL(blobUrl)
        }
        if (newConfirming !== (created.confirming_data ?? "") || newRefuting !== (created.refuting_data ?? "")) {
          await wvApi.update(created.id, { ...created, tags: created.tags ?? [], confirming_data: newConfirming, refuting_data: newRefuting })
        }
      }
      return created
    },
    target: { type: targetType, id: targetId },
    linkType: influence,
    invalidateKeys: [["worldview"]],
    onSuccess: (created) => { onCreated?.(created); handleClose() },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    create.mutate({ ...form, status: "актуально", tags: [] })
  }

  return (
    <Modal open={open} onClose={handleClose} title={t("actions.addWorldview")} size="lg">
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <LockedTargetChip label={t("relations.title")} value={targetLabel} icon={Compass} accent={typeColor[targetType] ?? "#4A90D9"} />

        {/* Тип влияния — своя ось для Worldview, отличная от confirms/refutes */}
        <div>
          <label style={{ display: "block", fontSize: 12, color: "#9393b5", marginBottom: 6 }}>
            {t("relations.linkTypeLabel")}
          </label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {influenceOptions(t).map(inf => (
              <button key={inf.value} type="button" onClick={() => setInfluence(inf.value)}
                title={inf.desc}
                style={{ fontSize: 11, padding: "4px 12px", borderRadius: 20, border: `1px solid ${influence === inf.value ? inf.color : "#222232"}`, background: influence === inf.value ? `${inf.color}18` : "transparent", color: influence === inf.value ? inf.color : "#9696a4", cursor: "pointer", fontWeight: influence === inf.value ? 600 : 400 }}>
                {inf.label}
              </button>
            ))}
          </div>
        </div>

        <Input label={t("worldview.dateLabel")} type="date" value={form.date} onChange={f("date")} />
        <Textarea label={t("worldview.beliefLabel")} placeholder={t("worldview.beliefPlaceholder")} value={form.belief} onChange={f("belief")} rows={3} required />
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 12, color: "#9393b5" }}>{t("worldview.confirmingLabel")}</label>
          <RichTextEditor value={form.confirming_data} onChange={html => setForm(p => ({ ...p, confirming_data: html }))}
            entityType="worldview" entityId={null} placeholder={t("worldview.confirmingPlaceholder")}
            onPendingFileAdded={(url, file) => pendingFilesRef.current.set(url, file)} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 12, color: "#9393b5" }}>{t("worldview.refutingLabel")}</label>
          <RichTextEditor value={form.refuting_data} onChange={html => setForm(p => ({ ...p, refuting_data: html }))}
            entityType="worldview" entityId={null} placeholder={t("worldview.refutingPlaceholder")}
            onPendingFileAdded={(url, file) => pendingFilesRef.current.set(url, file)} />
        </div>
        <VisibilitySelect value={form.visibility} onChange={v => setForm(p => ({ ...p, visibility: v }))} labId={form.lab_id} onLabChange={id => setForm(p => ({ ...p, lab_id: id }))} labs={labs} accent={typeColor.worldview} />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Button type="button" variant="ghost" onClick={handleClose}>{t("actions.cancel")}</Button>
          <Button type="submit" variant="primary" disabled={create.isPending}>{t("actions.save")}</Button>
        </div>
      </form>
    </Modal>
  )
}
