"use client"
// «Кому открыто»: полосы доступа в окне видимости и общий контрол видимости (пилюля + бирюзовый сегмент «Открыто: Лаба»).
import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Lock, Undo2, Users } from "lucide-react"
import { api } from "@/lib/api"
import { useT } from "@/lib/i18n/useT"
import { v2 } from "@/lib/theme"
import type { EntityType } from "@/lib/entity-routes"
import { entityHistoryApi } from "@/lib/entity-history-api"
import { invalidateAfterUndo } from "@/lib/entity-history-cache"
import { VisibilityBadge } from "@/components/entities/visibility-badge"
import { AccessBand, COLLAPSE_AFTER_MS } from "@/components/entities/access-band"

interface ShareRow { id: number; lab_id: number; lab_name: string; via_type: string; via_id: number; via_title: string }
interface ClosedRow { eventId: number }

const sharesKey = (type: string, id: number) => ["record-shares", type, id] as const
const fetchShares = (type: string, id: number) => api.get(`/api/v1/${type}/${id}/shares`).then(r => r.data as ShareRow[])

export function PassportShares({ entityType, entityId, enabled }: { entityType: string; entityId: number; enabled: boolean }) {
  const t = useT()
  const qc = useQueryClient()
  const [closed, setClosed] = useState<Record<number, ClosedRow>>({})
  const [gone, setGone] = useState<Set<number>>(new Set())
  const q = useQuery({ queryKey: sharesKey(entityType, entityId), queryFn: () => fetchShares(entityType, entityId), enabled, staleTime: 0, refetchOnMount: "always", retry: false })
  const close = useMutation({
    mutationFn: (row: ShareRow) => api.delete(`/api/v1/${entityType}/${entityId}/shares/${row.id}`).then(r => r.data as { event_id: number }),
    onSuccess: (data, row) => {
      setClosed(prev => ({ ...prev, [row.id]: { eventId: data.event_id } }))
      qc.invalidateQueries({ queryKey: ["entity-link-history"] })
    },
  })
  const restore = useMutation({
    mutationFn: ({ eventId }: { shareId: number; eventId: number }) => entityHistoryApi.undo(entityType as EntityType, entityId, eventId),
    onSuccess: async (_d, { shareId }) => {
      setClosed(prev => { const n = { ...prev }; delete n[shareId]; return n })
      await invalidateAfterUndo(qc, entityType as EntityType, entityId)
      qc.invalidateQueries({ queryKey: sharesKey(entityType, entityId) })
    },
  })
  const expire = (id: number) => {
    setGone(prev => new Set(prev).add(id))
    qc.invalidateQueries({ queryKey: sharesKey(entityType, entityId) })
  }

  const rows = (q.data ?? []).filter(r => !gone.has(r.id))
  if (q.isError || rows.length === 0) return null

  return (
    <section aria-label={t("shares.title")} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: v2.t4 }}>
        <Users size={13} aria-hidden />{t("shares.title")}
      </div>
      {rows.map(row => {
        const c = closed[row.id]
        return c ? (
          <AccessBand key={row.id} testId="share-row" tone="closed" icon={Lock} title={t("shares.closed", { lab: row.lab_name })}
            action={{ label: t("shares.restore"), icon: Undo2, disabled: restore.isPending, onClick: () => restore.mutate({ shareId: row.id, eventId: c.eventId }) }}
            expireAfter={COLLAPSE_AFTER_MS} onExpire={() => expire(row.id)} />
        ) : (
          <AccessBand key={row.id} testId="share-row" icon={Users} title={t("shares.row", { lab: row.lab_name, via: row.via_title || t("history.links.gone") })} hint={t("shares.readOnly")}
            action={{ label: t("shares.close"), danger: true, disabled: close.isPending, onClick: () => close.mutate(row) }} />
        )
      })}
      {(close.isError || restore.isError) && <div role="alert" style={{ fontSize: 12, color: v2.red }}>{t("shares.failed")}</div>}
    </section>
  )
}

/** Видимость записи одним контролом: пилюля «Личное» и склеенный с ней бирюзовый сегмент «Открыто: Лаба».
 *  Всегда в одну строку: сегмент сжимается многоточием, а не переносится. Нет доступов, нет и сегмента. */
export function VisibilityControl({ visibility, labColor, entityType, entityId, isOwner, onOpen }:
  { visibility: string; labColor?: string; entityType: string; entityId: number; isOwner: boolean; onOpen?: () => void }) {
  const t = useT()
  const [hover, setHover] = useState(false)
  const q = useQuery({ queryKey: sharesKey(entityType, entityId), queryFn: () => fetchShares(entityType, entityId), enabled: isOwner,
    staleTime: 10_000, refetchOnMount: "always", refetchOnWindowFocus: true, retry: 1 })
  const labs = Array.from(new Set((isOwner && !q.isError ? q.data ?? [] : []).map(r => r.lab_name)))
  const joined = labs.length > 0
  const label = labs.length === 1 ? t("shares.chip", { labs: labs[0] }) : t("shares.chipMany", { n: String(labs.length) })
  return (
    <span style={{ display: "inline-flex", alignItems: "center", flexWrap: "nowrap", maxWidth: "100%", minWidth: 0 }}>
      <span style={{ flexShrink: 0, display: "inline-flex" }}>
        <VisibilityBadge visibility={visibility} labColor={labColor} onClick={isOwner ? onOpen : undefined} join={joined ? "left" : undefined} />
      </span>
      {joined && (
        <button type="button" onClick={onOpen} title={labs.join(", ")} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
          style={{ display: "inline-flex", alignItems: "center", gap: 7, minWidth: 0, flex: "0 1 auto", height: 28, padding: "0 11px 0 7px", boxSizing: "border-box",
            borderRadius: "0 8px 8px 0", border: `1px solid ${v2.teal}59`, borderLeft: "none", cursor: onOpen ? "pointer" : "default",
            background: `linear-gradient(135deg, ${v2.teal}33 0%, ${v2.teal}0f 100%)`, color: v2.teal, fontSize: 13, fontWeight: 500, lineHeight: 1,
            boxShadow: hover ? `0 0 16px ${v2.teal}33` : `0 0 10px ${v2.teal}14`, transition: "box-shadow .15s, filter .15s", filter: hover ? "brightness(1.15)" : undefined }}>
          <span aria-hidden style={{ width: 18, height: 18, borderRadius: 6, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: `${v2.teal}33` }}>
            <Users size={11} />
          </span>
          <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
        </button>
      )}
    </span>
  )
}
