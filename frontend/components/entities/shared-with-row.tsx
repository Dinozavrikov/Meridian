"use client"
// Полосы доступа на строке связи (менеджер связей): «Открыта лаборатории X · только чтение» + «Закрыть доступ».
// После закрытия полоса остаётся нейтральной с «Вернуть» и схлопывается через 8 с. Закрытые хранятся здесь, а не в items:
// после закрытия сервер уже не отдаёт shared_with, но «Вернуть» должно жить.
import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Lock, Undo2, Users } from "lucide-react"
import { api } from "@/lib/api"
import { useT } from "@/lib/i18n/useT"
import type { EntityType } from "@/lib/entity-routes"
import { entityHistoryApi } from "@/lib/entity-history-api"
import { AccessBand, COLLAPSE_AFTER_MS } from "@/components/entities/access-band"

export interface SharedWith { share_id: number; lab_id: number; lab_name: string; entity_type: string; entity_id: number }
type Closed = { s: SharedWith; eventId: number }

export function SharedWithRow({ items }: { items: SharedWith[] }) {
  const t = useT()
  const qc = useQueryClient()
  const [closed, setClosed] = useState<Record<number, Closed>>({})
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ["related"] }), qc.invalidateQueries({ queryKey: ["record-shares"] }), qc.invalidateQueries({ queryKey: ["entity-link-history"] })])
  const drop = (id: number) => setClosed(p => { const n = { ...p }; delete n[id]; return n })
  const close = useMutation({
    mutationFn: (s: SharedWith) => api.delete(`/api/v1/${s.entity_type}/${s.entity_id}/shares/${s.share_id}`).then(r => r.data as { event_id: number }),
    onSuccess: (d, s) => { setClosed(p => ({ ...p, [s.share_id]: { s, eventId: d.event_id } })); void refresh() },
  })
  const restore = useMutation({
    mutationFn: (c: Closed) => entityHistoryApi.undo(c.s.entity_type as EntityType, c.s.entity_id, c.eventId),
    onSuccess: (_d, c) => { drop(c.s.share_id); void refresh() },
  })
  const open = items.filter(s => !closed[s.share_id])
  const shut = Object.values(closed)
  if (open.length === 0 && shut.length === 0) return null
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {open.map(s => (
        <AccessBand key={s.share_id} testId="shared-with" icon={Users} title={t("shares.byLink", { lab: s.lab_name })} hint={t("shares.readOnly")}
          action={{ label: t("shares.closeShort"), danger: true, disabled: close.isPending, onClick: () => close.mutate(s) }} />
      ))}
      {shut.map(c => (
        <AccessBand key={`c${c.s.share_id}`} testId="shared-closed" tone="closed" icon={Lock} title={t("shares.closed", { lab: c.s.lab_name })}
          action={{ label: t("shares.restore"), icon: Undo2, disabled: restore.isPending, onClick: () => restore.mutate(c) }}
          expireAfter={COLLAPSE_AFTER_MS} onExpire={() => drop(c.s.share_id)} />
      ))}
      {(close.isError || restore.isError) && <div role="alert" style={{ fontSize: 12, color: "#e05b5b" }}>{t("shares.failed")}</div>}
    </div>
  )
}
