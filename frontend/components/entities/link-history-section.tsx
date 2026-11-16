"use client"
import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link2, Link2Off, Repeat, Undo2, Lock, Layers, ChevronDown } from "lucide-react"
import { useT } from "@/lib/i18n/useT"
import { theme } from "@/lib/theme"
import type { EntityType } from "@/lib/entity-routes"
import { entityHistoryApi, parseUndoError, type LinkHistoryItem } from "@/lib/entity-history-api"
import { invalidateAfterUndo, linkHistoryQueryKey } from "@/lib/entity-history-cache"
import { UNDO_MUTATION_KEY } from "@/lib/use-history-live-refresh"

const ICON = { linked: Link2, unlinked: Link2Off, link_type_changed: Repeat, competing_hypothesis: Link2, competing_unlinked: Link2Off, competing_changed: Repeat, field_linked: Link2, field_unlinked: Link2Off, field_link_changed: Repeat, share_closed: Lock, share_opened: Link2 } as const

// Откат событий доступа блокируется по своим причинам: общий текст про тип связи тут вводил бы в заблуждение
const blockedKey = (i: LinkHistoryItem) => i.type.startsWith("share_") ? `history.blocked.share.${i.blocked_code}` : `history.blocked.${i.blocked_code}`

/** История связей записи: добавление, удаление, смена типа; откат тем же механизмом, что у правок полей. */
export function LinkHistorySection({ entityType, entityId }: { entityType: EntityType; entityId: number }) {
  const t = useT()
  const qc = useQueryClient()
  const [error, setError] = useState<{ id: number | string; text: string } | null>(null)
  const [open, setOpen] = useState<Set<string>>(new Set())
  const q = useQuery({
    queryKey: linkHistoryQueryKey(entityType, entityId),
    queryFn: () => entityHistoryApi.linkList(entityType, entityId),
    staleTime: 0, refetchOnMount: "always",
  })
  const undo = useMutation({
    mutationKey: UNDO_MUTATION_KEY,
    mutationFn: (item: LinkHistoryItem) => entityHistoryApi.undo(entityType, entityId, item.id),
    onMutate: () => setError(null),
    onSuccess: () => invalidateAfterUndo(qc, entityType, entityId),
    onError: (err, item) => {
      setError({ id: item.id, text: t(parseUndoError(err).key) })
      qc.invalidateQueries({ queryKey: linkHistoryQueryKey(entityType, entityId) })
    },
  })
  const undoBatch = useMutation({
    mutationKey: UNDO_MUTATION_KEY,
    mutationFn: (batchId: string) => entityHistoryApi.undoBatch(entityType, entityId, batchId),
    onMutate: () => setError(null),
    onSuccess: () => invalidateAfterUndo(qc, entityType, entityId),
    onError: (err, batchId) => {
      setError({ id: `batch:${batchId}`, text: t(parseUndoError(err).key) })
      qc.invalidateQueries({ queryKey: linkHistoryQueryKey(entityType, entityId) })
    },
  })
  const items = q.data ?? []
  // События одного пакета (два и больше) сворачиваются в одну запись на месте самого нового из них.
  const perBatch = new Map<string, LinkHistoryItem[]>()
  for (const i of items) if (i.batch_id) perBatch.set(i.batch_id, [...(perBatch.get(i.batch_id) ?? []), i])
  const seen = new Set<string>()
  const entries: ({ kind: "single"; item: LinkHistoryItem } | { kind: "batch"; id: string; items: LinkHistoryItem[] })[] = []
  for (const i of items) {
    const group = i.batch_id ? perBatch.get(i.batch_id) : undefined
    if (i.batch_id && group && group.length >= 2) {
      if (!seen.has(i.batch_id)) { seen.add(i.batch_id); entries.push({ kind: "batch", id: i.batch_id, items: group }) }
    } else entries.push({ kind: "single", item: i })
  }
  if (q.isError || items.length === 0) return null

  const describe = (i: LinkHistoryItem) => {
    const title = i.other_title ?? t("history.links.gone")
    if (i.type === "linked" || i.type === "competing_hypothesis" || i.type === "field_linked") return t("history.links.linked", { title })
    if (i.type === "unlinked" || i.type === "competing_unlinked" || i.type === "field_unlinked") return t("history.links.unlinked", { title })
    if (i.type === "share_closed") return t("history.links.shareClosed", { title })
    if (i.type === "share_opened") return t("history.links.shareOpened", { title })
    if (i.type === "field_link_changed") return t("history.links.fieldChanged", { title, old: i.old ?? "—", new: i.new ?? "—" })
    if (i.type === "competing_changed") {
      const v = (x: string | null) => (x && ["leading", "alternative", "rejected"].includes(x) ? t(`relations.role.${x}`) : x ?? "—")
      return t("history.links.competingChanged", { title, old: v(i.old), new: v(i.new) })
    }
    return t("history.links.changed", { title, old: i.old ?? "—", new: i.new ?? "—" })
  }

  return (
    <section aria-label={t("history.links.title")} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "#9aa1c2" }}>{t("history.links.title")}</span>
        <span style={{ flex: 1, height: 1, background: theme.ln2 }} />
      </div>
      {entries.map(e => {
        if (e.kind === "batch") {
          const pending = e.items.filter(x => !x.reverted)
          const blocked = pending.find(x => !x.undoable)
          const expanded = open.has(e.id)
          return (
            <div key={`batch:${e.id}`} data-testid="link-history-row" style={{ background: theme.bg2, border: `1px solid ${theme.ln2}`, borderLeft: "3px solid #4A90D9", borderRadius: 12, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                <Layers size={14} aria-hidden style={{ color: "#4A90D9", flexShrink: 0 }} />
                <span style={{ flex: "1 1 200px", minWidth: 0, fontSize: 14, color: theme.tx1 }}>{t("history.links.batch", { n: String(e.items.length) })}</span>
                <span style={{ fontFamily: theme.mono, fontSize: 12, color: "#9aa1c2" }}>{new Date(e.items[0].created_at).toLocaleString()}</span>
                {pending.length === 0 && <span style={{ fontSize: 12, color: "#F5A623" }}>{t("history.reverted")}</span>}
                {pending.length > 0 && !blocked && (
                  <button type="button" className="eh-btn" disabled={undoBatch.isPending} onClick={() => undoBatch.mutate(e.id)}>
                    <Undo2 size={13} />{t("history.links.batchUndo")}
                  </button>
                )}
              </div>
              {blocked && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#9aa1c2" }}>
                  <Lock size={12} />{t(`history.blocked.${blocked.blocked_code ?? "unknown"}`)}
                </div>
              )}
              <button type="button" aria-expanded={expanded} onClick={() => setOpen(prev => { const n = new Set(prev); if (n.has(e.id)) n.delete(e.id); else n.add(e.id); return n })}
                style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 12, color: "#9aa1c2" }}>
                <ChevronDown size={13} aria-hidden style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
                {t(expanded ? "history.links.batchHide" : "history.links.batchShow")}
              </button>
              {expanded && e.items.map(x => (
                <div key={x.id} style={{ fontSize: 13, color: theme.tx1, paddingLeft: 20, overflowWrap: "anywhere" }}>{describe(x)}</div>
              ))}
              {error?.id === `batch:${e.id}` && <div role="alert" style={{ fontSize: 12, color: "#E74C3C" }}>{error.text}</div>}
            </div>
          )
        }
        const i = e.item
        const Icon = ICON[i.type]
        return (
          <div key={i.id} data-testid="link-history-row" style={{ background: theme.bg2, border: `1px solid ${theme.ln2}`, borderRadius: 12, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
              <Icon size={14} aria-hidden style={{ color: "#9aa1c2", flexShrink: 0 }} />
              <span style={{ flex: "1 1 200px", minWidth: 0, fontSize: 14, color: theme.tx1, overflowWrap: "anywhere" }}>{describe(i)}</span>
              <span style={{ fontFamily: theme.mono, fontSize: 12, color: "#9aa1c2" }}>{new Date(i.created_at).toLocaleString()}</span>
              {i.reverted && <span style={{ fontSize: 12, color: "#F5A623" }}>{t("history.reverted")}</span>}
              {i.undoable && (
                <button type="button" className="eh-btn" disabled={undo.isPending} onClick={() => undo.mutate(i)}>
                  <Undo2 size={13} />{i.reverts_event_id != null ? t("history.redo") : t("history.undo")}
                </button>
              )}
            </div>
            {!i.undoable && !i.reverted && i.blocked_code && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#9aa1c2" }}>
                <Lock size={12} />{t(blockedKey(i))}
              </div>
            )}
            {error?.id === i.id && <div role="alert" style={{ fontSize: 12, color: "#E74C3C" }}>{error.text}</div>}
          </div>
        )
      })}
    </section>
  )
}
