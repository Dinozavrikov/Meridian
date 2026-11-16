"use client"
import React, { useState } from "react"
import Link from "next/link"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { useT } from "@/lib/i18n/useT"
import { useMyLabs } from "@/lib/use-my-labs"
import { Modal } from "@/components/ui/modal"
import { Button } from "@/components/ui/button"
import { VisibilityPicker } from "@/components/entities/visibility-picker"
import { VisibilityBadge } from "@/components/entities/visibility-badge"
import { PassportShares, VisibilityControl } from "@/components/entities/passport-shares"
import { ink } from "@/lib/theme"

interface PassportVisibilityProps {
  entityType: string
  entityId: number
  visibility: string
  labId?: number | null
  /** менять видимость может только автор; остальные видят бейдж без кнопки */
  isOwner: boolean
  accent: string
}

// Списки и связи читают запись из кэша под этими ключами: после смены видимости их надо перечитать.
const REFRESH_KEYS = new Set(["observations", "hypotheses", "predictions", "worldview", "questions", "tasks", "related", "record-shares"])

/** Видимость записи в паспорте: автору бейдж открывает выбор (один для всех типов сущностей). */
export function PassportVisibility({ entityType, entityId, visibility, labId = null, isOwner, accent }: PassportVisibilityProps) {
  const t = useT()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [vis, setVis] = useState(visibility)
  const [selLab, setSelLab] = useState<number | null>(labId)
  const { data: labs = [], isLoading: labsLoading } = useMyLabs(open)

  const save = useMutation({
    mutationFn: () => api.put(`/api/v1/${entityType}/${entityId}/visibility`, { visibility: vis, lab_id: vis === "lab" ? selLab : null }),
    onSuccess: () => {
      qc.invalidateQueries({ predicate: q => REFRESH_KEYS.has(String(q.queryKey[0])) })
      setOpen(false)
    },
  })

  if (!isOwner) return <VisibilityBadge visibility={visibility} labColor={accent} />

  const openModal = () => { setVis(visibility); setSelLab(labId); save.reset(); setOpen(true) }
  const needsLab = vis === "lab" && !selLab
  const unchanged = vis === visibility && selLab === labId
  const noLabs = vis === "lab" && !labsLoading && labs.length === 0
  const canSave = !needsLab && !unchanged && !save.isPending

  return (
    <>
      <VisibilityControl visibility={visibility} labColor={accent} entityType={entityType} entityId={entityId} isOwner onOpen={openModal} />
      <Modal open={open} onClose={() => setOpen(false)} title={t("passportVisibility.title")} size="sm" compact>
        <form onSubmit={e => { e.preventDefault(); if (canSave) save.mutate() }} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: ink.muted }}>{t("passportVisibility.hint")}</p>
          <VisibilityPicker value={vis} onChange={setVis} labId={selLab} onLabChange={setSelLab} labs={labs} accent={accent} />
          {noLabs && (
            <div role="note" style={{ display: "flex", flexDirection: "column", gap: 8, padding: "10px 12px", borderRadius: 10, background: ink.well, border: `1px solid ${ink.line}`, fontSize: 13, lineHeight: 1.5, color: ink.label }}>
              {t("passportVisibility.noLabs")}
              <Link href="/labs" style={{ color: accent, fontWeight: 600, textDecoration: "none" }}>{t("passportVisibility.createLab")} →</Link>
            </div>
          )}
          <PassportShares entityType={entityType} entityId={entityId} enabled={open} />
          {save.isError && <div role="alert" style={{ fontSize: 12, color: "#E74C3C" }}>{t("passportVisibility.saveFailed")}</div>}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, paddingTop: 14, borderTop: `1px solid ${ink.line}` }}>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>{t("actions.cancel")}</Button>
            <Button type="submit" variant="primary" disabled={!canSave}>{t("actions.save")}</Button>
          </div>
        </form>
      </Modal>
    </>
  )
}
