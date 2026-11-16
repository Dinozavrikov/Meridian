"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Search, X, Link2, ChevronDown } from "lucide-react"
import { api } from "@/lib/api"
import { useT } from "@/lib/i18n/useT"
import { useTypeRu } from "@/lib/i18n/useTypeRu"
import { useContentT } from "@/lib/i18n/useContentT"
import { useTranslatedRelated } from "@/lib/i18n/use-translated-query"
import { StatusBadge } from "@/components/ui/status-badge"
import { CompetingChips, CompetingSummary, sortByRole } from "@/components/entities/competing-chips"
import { CompetingLeadWarning } from "@/components/entities/competing-lead-warning"
import { LinkLockNotice, type LinkLock } from "@/components/entities/link-lock-notice"
import { PreviewLink, PreviewLinkTitle } from "@/components/entities/preview-link"
import type { LinkProvenanceItem } from "@/lib/link-provenance"
import { LinkProvenanceRow } from "@/components/entities/link-provenance-row"
import { getLinkTypes } from "@/components/entities/link-types"
import { safeEntityHref } from "@/lib/entity-routes"
import { viewItems, linkKey, type RelSort } from "@/lib/relation-view"
import { batchState, buildOps, setTypeBlock, rowCurrent, FIELD_STANCES, type BatchAction, type BatchOpIn, type BatchRow } from "@/lib/relation-batch"
import { buildRelationContext } from "@/components/entities/relation-context"
import { ink, theme, typeColor } from "@/lib/theme"
import { readableOn } from "@/lib/color"
import { linkTypesFor, sameTypeBlocked } from "@/lib/link-vocab"
import { influenceOptions } from "@/lib/worldview-influence"
import { toastUndo, announceLinkChange } from "@/lib/link-undo"
import { EffectChip } from "@/components/entities/effect-chip"
import { BatchImpact, type BatchPreview } from "@/components/entities/batch-impact"
import type { LinkEffect } from "@/lib/link-effect"
import { SharedWithRow, type SharedWith } from "@/components/entities/shared-with-row"

interface RelatedItem {
  id: number; title: string; link_type?: string | null; status?: string | null
  direct?: boolean; source?: string; can_edit?: boolean; role?: string | null; stance?: string | null; capabilities?: string[]; lock?: LinkLock | null; linked_by?: LinkProvenanceItem["linked_by"]; linked_at?: string | null; parent_type?: string | null; parent_id?: number | null
  effect?: LinkEffect | null
  shared_with?: SharedWith[]
}
interface Removed { type: string; id: number; title: string; link_type: string; eventId?: number | null; competing?: boolean; field?: number }

// Конкурирующая гипотеза живёт в отдельной таблице: отвязка идёт через эндпоинт родителя (задача или вопрос).
function competingUrl(self: { type: string; id: number }, r: { type: string; id: number }) {
  const itemIsParent = r.type === "task" || r.type === "question"
  const parent = itemIsParent ? r : self
  const hid = itemIsParent ? self.id : r.id
  return `/api/v1/${parent.type === "task" ? "tasks" : "questions"}/${parent.id}/hypotheses/${hid}`
}
const linkQuery = (a: { type: string; id: number }, b: { type: string; id: number }) =>
  `from_type=${a.type}&from_id=${a.id}&to_type=${b.type}&to_id=${b.id}`

interface MentionItem { id: number; type: string; title: string; status?: string | null; fields: string[]; is_own?: boolean }

/** Упоминания в тексте (не связи): группа «Упоминает» или «Упомянуто в». «Сделать связью» создаёт нейтральную связь. */
function MentionGroup({ label, items, typeRu, makeLinkLabel, pending, onPromote }: {
  label: string; items: MentionItem[]; typeRu: Record<string, string>; makeLinkLabel: string; pending: boolean; onPromote: (m: MentionItem) => void
}) {
  if (items.length === 0) return null
  return (
    <section aria-label={label}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: ink.label }}>{label}</span>
        <span style={{ fontFamily: theme.mono, fontSize: 11, color: ink.muted }}>{items.length}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {items.map(m => (
          <div key={`${m.type}:${m.id}`} style={{ display: "flex", alignItems: "stretch", gap: 6 }}>
            <PreviewLink type={m.type} id={m.id} href={safeEntityHref(m.type, m.id)}
              style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2, padding: "8px 12px", borderRadius: 10, textDecoration: "none", background: ink.card, border: `1px dashed ${ink.line}`, borderLeft: `3px solid ${typeColor[m.type] ?? "#555"}` }}>
              <PreviewLinkTitle fontSize={13} color={theme.tx1}>{m.title}</PreviewLinkTitle>
              <span style={{ fontSize: 12, color: ink.muted }}>{typeRu[m.type] ?? m.type}</span>
            </PreviewLink>
            <button type="button" disabled={pending} aria-label={makeLinkLabel} title={makeLinkLabel} onClick={() => onPromote(m)}
              style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 5, padding: "0 12px", borderRadius: 10, cursor: "pointer", fontSize: 12, border: `1px solid ${ink.line}`, background: "transparent", color: ink.label }}>
              <Link2 size={13} aria-hidden />{makeLinkLabel}
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}

/** Управление связями записи: поиск и добавление в одном месте, карточки-ссылки, удаление с отменой. Один для всех типов. */
export function RelationManager({ entityType, entityId }: { entityType: string; entityId: number }) {
  const t = useT()
  const typeRu = useTypeRu()
  const qc = useQueryClient()
  const linkTypes = getLinkTypes(t)
  // страница убеждения: у связи с убеждением свои типы (влияние), а не «подтверждает/опровергает»
  const influence = influenceOptions(t)
  const addTypes = entityType === "worldview" ? linkTypesFor(linkTypes, "worldview", "", influence) : linkTypes
  // влияние на убеждение: фильтр, подписи и пакет знают и его
  const allTypes = [...influence, ...linkTypes]
  const [q, setQ] = useState("")
  const [linkType, setLinkType] = useState("связано")
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [showIndirect, setShowIndirect] = useState(false)
  const [filter, setFilter] = useState("all")
  const [sort, setSort] = useState<RelSort>("default")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [pendingType, setPendingType] = useState<string | null>(null)
  const [batchErrors, setBatchErrors] = useState<{ title: string; message: string }[] | null>(null)

  const { data, isLoading } = useTranslatedRelated(entityType, entityId)
  const grouped: Record<string, RelatedItem[]> = data?.related ?? {}
  const total = Object.values(grouped).reduce((s, a) => s + a.length, 0)
  const directGroups = Object.entries(grouped).map(([type, items]) => [type, viewItems(sortByRole(items.filter(i => i.direct !== false)), { filter, sort })] as const).filter(([, items]) => items.length > 0)
  const typeCounts = Object.values(grouped).flat().filter(i => i.direct !== false && i.source !== "competing").reduce<Record<string, number>>((m, i) => { const k = linkKey(i) ?? "связано"; m[k] = (m[k] ?? 0) + 1; return m }, {})
  const indirect = Object.entries(grouped).flatMap(([type, items]) => items.filter(i => i.direct === false).map(i => ({ type, item: i })))
  const directTotal = total - indirect.length
  const linked = new Set(Object.entries(grouped).flatMap(([type, items]) => items.map(i => `${type}:${i.id}`)))
  const self = { type: entityType, id: entityId }
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["related", entityType, entityId] })
    qc.invalidateQueries({ queryKey: ["entity-link-history"] })
  }

  const { data: found = [] } = useQuery({
    queryKey: ["link-search", q, "manager", entityType, entityId],
    queryFn: () => api.get(`/api/v1/graph/search?q=${encodeURIComponent(q)}&exclude_type=${entityType}&exclude_id=${entityId}`).then(r => r.data),
    enabled: q.trim().length >= 1,
  })
  const candidates = (found as { type: string; id: number; title: string; status?: string; is_own?: boolean }[]).filter(r => !linked.has(`${r.type}:${r.id}`))
  // «Подтверждает/опровергает» между записями одного типа бэкенд не принимает: такие результаты скрыты, под поиском подсказка
  const results = candidates.filter(r => !sameTypeBlocked(linkType, entityType, r.type))
  const hiddenSame = results.length !== candidates.length

  const { ct, ensure } = useContentT()
  const keyOfResults = results.map(r => `${r.type}:${r.id}`).join(",")
  useEffect(() => {
    ensure(results.filter(r => !r.is_own && r.title).map(r => ({ entityType: r.type, entityId: r.id, field: "title", text: r.title })))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyOfResults])
  const titleOf = (r: { type: string; id: number; title: string; is_own?: boolean }) => r.is_own ? r.title : ct(r.type, r.id, "title", r.title)

  const add = useMutation({
    mutationFn: async (r: { type: string; id: number; title: string; is_own?: boolean }) => {
      await api.post(`/api/v1/graph/links?${linkQuery(self, r)}&link_type=${encodeURIComponent(linkType)}`)
      return r
    },
    onSuccess: r => {
      refresh(); setQ("")
      void announceLinkChange({ entityType, entityId, kind: "add", other: r, message: `${t("relations.added")}: ${titleOf(r)}`, onUndone: refresh })
    },
  })
  const remove = useMutation({
    mutationFn: async (r: Removed): Promise<Removed> => {
      const res = r.field ? await api.delete(`/api/v1/field-link/prediction/${r.field}`)
        : r.competing ? await api.delete(competingUrl(self, r)) : await api.delete(`/api/v1/graph/links?${linkQuery(self, r)}`)
      if (res?.data?.removed === 0) throw new Error("not removed")
      return r
    },
    onSuccess: r => {
      refresh(); setFailed(false)
      // «Вернуть» живёт в общем хосте уведомлений; события нет (чужая или заданная в записи связь): только сообщение
      void announceLinkChange({ entityType, entityId, kind: "remove", other: r, message: `${t("relations.removed")}: ${r.title}`, tone: "info", onUndone: refresh })
    },
    onError: () => setFailed(true),
  })
  const changeType = useMutation({
    mutationFn: (r: { type: string; id: number; link_type: string; field?: number }) =>
      r.field ? api.put(`/api/v1/field-link/prediction/${r.field}`, { confirms: r.link_type === "подтверждает" })
        : api.put(`/api/v1/graph/links?${linkQuery(self, r)}&link_type=${encodeURIComponent(r.link_type)}`),
    onSuccess: (_d, r) => {
      refresh(); setMenuFor(null); setFailed(false)
      void announceLinkChange({ entityType, entityId, kind: "change", other: { type: r.type, id: r.id }, message: t("relations.typeChanged"), onUndone: refresh })
    },
    onError: () => setFailed(true),
  })

  const mentionsData = (data as { mentions?: { mentions?: MentionItem[]; mentioned_in?: MentionItem[] } } | undefined)?.mentions
  const promote = useMutation({
    mutationFn: async (m: MentionItem) => {
      await api.post(`/api/v1/graph/links?${linkQuery(self, m)}&link_type=${encodeURIComponent("связано")}`)
      return m
    },
    onSuccess: m => {
      refresh(); setFailed(false)
      void announceLinkChange({ entityType, entityId, kind: "add", other: m, message: `${t("relations.added")}: ${m.title}`, onUndone: refresh })
    },
    onError: () => setFailed(true),
  })

  const showPick = directTotal >= 2
  const rows = directGroups.flatMap(([type, items]) => items.map(i => ({
    key: `${type}:${i.id}`, type, id: i.id, title: i.title, source: i.source, stance: i.stance, current: rowCurrent(i), ok: batchState(i).ok })))
  const pickable = rows.filter(r => r.ok)
  const batchTypes = entityType === "worldview" || rows.some(r => r.type === "worldview") ? allTypes : linkTypes
  const picks: BatchRow[] = pickable.filter(r => selected.has(r.key))
  // пробный запуск на сервере: что станет с сигналом гипотез, если применить выбранный тип (в базу ничего не пишется)
  const previewOps = pendingType && picks.length > 0 ? buildOps(picks, { kind: "set_type", linkType: pendingType }) : null
  const batchPreview = useQuery({
    queryKey: ["batch-preview", entityType, entityId, previewOps],
    queryFn: async () => (await api.post(`/api/v1/${entityType}/${entityId}/links/batch/preview`, { ops: previewOps })).data as BatchPreview,
    enabled: !!previewOps, retry: false,
  })
  const toggle = (k: string) => setSelected(prev => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n })
  const runBatch = useMutation({
    mutationFn: async (v: { ops: BatchOpIn[]; titles: string[] }) =>
      (await api.post(`/api/v1/${entityType}/${entityId}/links/batch`, { ops: v.ops })).data as { batch_id: string; applied: number },
    onSuccess: r => {
      refresh(); setBatchErrors(null); setFailed(false); setSelected(new Set()); setPendingType(null)
      toastUndo({ message: t("relations.batch.applied", { n: String(r.applied) }), undoUrl: `/api/v1/${entityType}/${entityId}/undo/batch/${r.batch_id}`, tone: "info", onUndone: refresh })
    },
    onError: (e: any, v) => {
      const errs = e?.response?.data?.detail?.errors
      if (Array.isArray(errs)) setBatchErrors(errs.map((x: { index: number; message: string }) => ({ title: v.titles[x.index] ?? "", message: x.message })))
      else setFailed(true)
      setPendingType(null)
    },
  })
  const go = (action: BatchAction) => { setBatchErrors(null); runBatch.mutate({ ops: buildOps(picks, action), titles: picks.map(p => p.title) }) }
  useEffect(() => { if (picks.length === 0 && pendingType) setPendingType(null) }, [picks.length, pendingType])
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <h4 style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: ink.label }}>{t("relations.title")}</h4>
        {directTotal > 0 && <span style={{ fontFamily: theme.mono, fontSize: 11, color: ink.muted }}>{directTotal}</span>}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 12, borderRadius: 12, background: ink.well, border: `1px solid ${ink.line}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 12px", height: 38, borderRadius: 9, background: ink.card, border: `1px solid ${ink.line}` }}>
          <Search size={14} aria-hidden style={{ color: ink.muted, flexShrink: 0 }} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder={t("relations.searchPlaceholder")} aria-label={t("relations.searchPlaceholder")}
            style={{ flex: 1, minWidth: 0, background: "none", border: "none", outline: "none", fontSize: 14, color: theme.tx1 }} />
        </div>
        <div role="group" aria-label={t("relations.linkTypeLabel")} style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {addTypes.map(lt => {
            const active = linkType === lt.value
            return (
              <button key={lt.value} type="button" aria-pressed={active} onClick={() => setLinkType(lt.value)}
                style={{ fontSize: 12, padding: "5px 12px", borderRadius: 999, cursor: "pointer", fontWeight: active ? 600 : 400,
                  border: `1px solid ${active ? lt.color : ink.line}`, background: active ? `${lt.color}1f` : "transparent", color: active ? readableOn(lt.color) : ink.label }}>
                {lt.label}
              </button>
            )
          })}
        </div>
        {q.trim().length >= 1 && (
          <div style={{ maxHeight: 240, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
            {results.length === 0 && <div style={{ padding: "10px 4px", fontSize: 13, color: ink.muted }}>{t("relations.noneFound")}</div>}
            {results.map(r => (
              <button key={`${r.type}-${r.id}`} type="button" onClick={() => add.mutate(r)} disabled={add.isPending}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 8, textAlign: "left", cursor: "pointer", border: "1px solid transparent", background: "transparent", color: "#d6d9ec" }}>
                <span aria-hidden style={{ width: 3, height: 26, borderRadius: 2, background: typeColor[r.type] ?? "#555", flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{titleOf(r)}</span>
                  <span style={{ display: "block", fontSize: 12, color: ink.muted }}>{typeRu[r.type] ?? r.type}</span>
                </span>
              </button>
            ))}
          </div>
        )}
        {hiddenSame && <div role="note" style={{ fontSize: 12, color: ink.muted }}>{t("relations.sameTypeHidden")}</div>}
      </div>

      {directTotal >= 2 && (
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
          <label title={t("relations.batch.selectAll")} style={{ display: "flex", alignItems: "center", padding: "0 4px", cursor: pickable.length ? "pointer" : "not-allowed" }}>
            <input type="checkbox" aria-label={t("relations.batch.selectAll")} disabled={pickable.length === 0}
              checked={pickable.length > 0 && picks.length === pickable.length}
              ref={el => { if (el) el.indeterminate = picks.length > 0 && picks.length < pickable.length }}
              onChange={() => setSelected(picks.length === pickable.length ? new Set() : new Set(pickable.map(r => r.key)))}
              style={{ width: 16, height: 16, accentColor: "#4A90D9" }} />
          </label>
          <div role="group" aria-label={t("relations.linkTypeLabel")} style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {[{ value: "all", label: t("relations.filter.all"), color: ink.label }, ...allTypes.filter(lt => typeCounts[lt.value])].map(lt => {
              const active = filter === lt.value
              return (
                <button key={lt.value} type="button" aria-pressed={active} onClick={() => setFilter(lt.value)}
                  style={{ fontSize: 12, padding: "4px 10px", borderRadius: 999, cursor: "pointer", fontWeight: active ? 600 : 400,
                    border: `1px solid ${active ? lt.color : ink.line}`, background: active ? `${lt.color}1f` : "transparent", color: active ? readableOn(lt.color) : ink.label }}>
                  {lt.label}{lt.value !== "all" && <span style={{ marginLeft: 6, fontFamily: theme.mono, opacity: 0.7 }}>{typeCounts[lt.value]}</span>}
                </button>
              )
            })}
          </div>
          <button type="button" onClick={() => setSort(sort === "default" ? "fresh" : "default")} aria-pressed={sort === "fresh"}
            style={{ marginLeft: "auto", fontSize: 12, padding: "4px 10px", borderRadius: 999, cursor: "pointer", border: `1px solid ${ink.line}`, background: "transparent", color: ink.label }}>
            {t(sort === "fresh" ? "relations.sort.fresh" : "relations.sort.default")}
          </button>
        </div>
      )}
      {picks.length > 0 && (
        <div role="region" aria-label={t("relations.batch.panel")}
          style={{ position: "sticky", bottom: 12, zIndex: 20, display: "flex", flexDirection: "column", gap: 10, padding: 12, borderRadius: 12, background: ink.well,
            border: `1px solid ${ink.line}`, borderTop: "2px solid #4A90D9", boxShadow: "0 12px 32px rgba(0,0,0,0.55)" }}>
          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10, fontSize: 13, color: "#d6d9ec" }}>
            <span>{t("relations.batch.selected", { n: String(picks.length), m: String(pickable.length) })}</span>
            <button type="button" onClick={() => { setSelected(new Set()); setPendingType(null) }} disabled={picks.length === 0}
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: ink.label }}>{t("relations.batch.clear")}</button>
          </div>
          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
            <span style={{ fontSize: 12, color: ink.muted }}>{t("relations.batch.setType")}</span>
            {batchTypes.map(lt => {
              const block = setTypeBlock(picks, lt.value, entityType)
              const allowed = block === null
              return (
                <button key={lt.value} type="button" disabled={picks.length === 0 || !allowed || runBatch.isPending}
                  title={block === null ? undefined : t(block === "field" ? "relations.batch.fieldStanceOnly" : "relations.batch.pairNotAllowed")} onClick={() => setPendingType(lt.value)}
                  style={{ fontSize: 12, padding: "4px 10px", borderRadius: 999, cursor: "pointer", opacity: picks.length === 0 || !allowed ? 0.45 : 1,
                    border: `1px solid ${pendingType === lt.value ? lt.color : ink.line}`, background: pendingType === lt.value ? `${lt.color}1f` : "transparent", color: readableOn(lt.color) }}>
                  {lt.label}
                </button>
              )
            })}
            <button type="button" disabled={picks.length === 0 || runBatch.isPending} onClick={() => go({ kind: "remove" })}
              style={{ marginLeft: "auto", fontSize: 12, padding: "4px 12px", borderRadius: 999, cursor: "pointer", opacity: picks.length === 0 ? 0.45 : 1,
                border: "1px solid #E74C3C59", background: "#E74C3C1f", color: readableOn("#E74C3C") }}>
              {t("relations.batch.remove")}
            </button>
          </div>
          {pendingType && picks.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10, paddingTop: 8, borderTop: `1px solid ${ink.line}` }}>
              <span style={{ fontSize: 13, color: "#d6d9ec" }}>{t("relations.batch.confirm", { n: String(picks.length), type: allTypes.find(l => l.value === pendingType)?.label ?? pendingType })}</span>
              {batchPreview.data && previewOps && <BatchImpact data={batchPreview.data} />}
              <button type="button" disabled={runBatch.isPending} onClick={() => go({ kind: "set_type", linkType: pendingType })}
                style={{ marginLeft: "auto", fontSize: 12, fontWeight: 600, padding: "4px 12px", borderRadius: 999, cursor: "pointer", border: "1px solid #4A90D959", background: "#4A90D91f", color: readableOn("#4A90D9") }}>
                {t("relations.batch.apply")}
              </button>
              <button type="button" onClick={() => setPendingType(null)}
                style={{ fontSize: 12, background: "none", border: "none", cursor: "pointer", color: ink.label }}>{t("actions.cancel")}</button>
            </div>
          )}
        </div>
      )}
      {directTotal > 0 && directGroups.length === 0 && <div style={{ fontSize: 13, color: ink.muted }}>{t("relations.filterEmpty")}</div>}

      {!isLoading && directTotal === 0 && (
        <div style={{ textAlign: "center", padding: "20px 0", color: ink.muted, fontSize: 13 }}>
          <Link2 size={18} aria-hidden style={{ display: "block", margin: "0 auto 6px", opacity: 0.5 }} />{t("relations.noLinks")}
        </div>
      )}

      {directGroups.map(([type, items]) => (
        <section key={type} aria-label={typeRu[type] ?? type}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span aria-hidden style={{ width: 3, height: 14, borderRadius: 2, background: typeColor[type] ?? "#555" }} />
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: ink.label }}>{typeRu[type] ?? type}</span>
            <span style={{ fontFamily: theme.mono, fontSize: 11, color: ink.muted }}>{items.length}</span>{type === "hypothesis" && <CompetingSummary items={items} />}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {type === "hypothesis" && (self.type === "question" || self.type === "task") && (
              <CompetingLeadWarning parentType={self.type} parentId={self.id} leadingId={items.find(i => i.source === "competing" && i.role === "leading")?.id ?? null} />
            )}
            {items.map(item => {
              const rowOptions = linkTypesFor(linkTypes, entityType, type, influence)
              const lt = [...rowOptions, ...linkTypes].find(l => l.value === (item.source === "field" ? item.stance : item.link_type)) ?? linkTypes.find(l => l.value === "связано")!
              const key = `${type}:${item.id}`
              const menuOpen = menuFor === key
              const caps = item.capabilities ?? (item.can_edit === false ? [] : ["remove", "set_type"])
              const removable = caps.includes("remove")
              const provenance = item.linked_by ? <LinkProvenanceRow item={item} /> : null
              const editable = caps.includes("set_type")
              const parentTitle = item.parent_type ? (grouped[item.parent_type] ?? []).find(i => i.id === item.parent_id)?.title : undefined
              const note = item.source === "competing" ? t(type === "hypothesis" ? "relations.competing" : "relations.competingHereNote")
                : editable ? null
                : item.direct === false ? t("relations.via", { title: parentTitle ?? "…" })
                : item.source === "field" ? t("relations.predClosed")
                : item.source === "link" ? t("relations.otherAuthor")
                : t("relations.fieldLinked")
              return (
                <div key={item.id} data-selected={selected.has(key) ? "true" : undefined}
                  style={{ display: "flex", alignItems: "stretch", borderRadius: 10, overflow: "hidden", transition: "background 0.12s, border-color 0.12s",
                    background: selected.has(key) ? `${lt.color}14` : ink.card, border: `1px solid ${selected.has(key) ? `${lt.color}66` : ink.line}` }}>
                  <span aria-hidden style={{ width: 3, background: lt.color, flexShrink: 0 }} />
                  {showPick && (() => { const st = batchState(item); return (
                    <label title={st.ok ? undefined : t(st.reason ?? "relations.batch.noRights")}
                      style={{ display: "flex", alignItems: "flex-start", padding: "12px 0 0 10px", cursor: st.ok ? "pointer" : "not-allowed" }}>
                      <input type="checkbox" checked={selected.has(key)} disabled={!st.ok} onChange={() => toggle(key)}
                        aria-label={`${t("relations.batch.pickRow")}: ${item.title}`}
                        style={{ width: 16, height: 16, accentColor: lt.color, opacity: st.ok ? (selected.has(key) ? 1 : 0.6) : 0.3 }} />
                    </label>
                  ) })()}
                  <div style={{ flex: 1, minWidth: 0, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
                    <PreviewLink type={type} id={item.id} href={safeEntityHref(type, item.id)}
                      context={buildRelationContext(item, { t, linkTypes: allTypes, parentTitle })}
                      style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, minWidth: 0, textDecoration: "none", color: "inherit" }}>
                      <PreviewLinkTitle fontSize={14} color={theme.tx1}>{item.title}</PreviewLinkTitle>
                      {item.status && <StatusBadge status={item.status} fontSize={10} />}
                    </PreviewLink>
                    {item.source === "competing" && <CompetingChips self={self} item={{ type, id: item.id, role: item.role, stance: item.stance }} editable={caps.includes("set_role")} />}
                    {item.source === "competing" && (type === "question" || type === "task") && self.type === "hypothesis" && (
                      <CompetingLeadWarning parentType={type} parentId={item.id} leadingId={item.role === "leading" ? self.id : null} />
                    )}
                    {item.effect && <EffectChip effect={item.effect} otherType={type === "hypothesis" ? self.type : type} />}
                    {item.lock ? <LinkLockNotice lock={item.lock} /> : note && <div style={{ fontSize: 12, color: ink.muted }}>{note}</div>}
                    {provenance}
                    {item.shared_with && <SharedWithRow items={item.shared_with} />}
                    <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
                      <button type="button" aria-haspopup="menu" disabled={!editable} hidden={item.source === "competing"} aria-expanded={menuOpen} aria-label={t("relations.changeType")} title={t("relations.changeType")}
                        onClick={() => setMenuFor(menuOpen ? null : key)}
                        style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, padding: "3px 8px 3px 10px", borderRadius: 999, cursor: "pointer",
                          border: `1px solid ${lt.color}59`, background: `${lt.color}1f`, color: readableOn(lt.color) }}>
                        {item.source === "competing" ? t(type === "hypothesis" ? "relations.competingShort" : "relations.competingHere") : lt.label}{item.source !== "competing" && <ChevronDown size={12} aria-hidden style={{ transform: menuOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />}
                      </button>
                      {menuOpen && (
                        <div role="menu" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {rowOptions.filter(o => item.source !== "field" || FIELD_STANCES.includes(o.value)).map(o => (
                            <button key={o.value} type="button" role="menuitemradio" aria-checked={o.value === lt.value} disabled={changeType.isPending}
                              onClick={() => o.value === lt.value ? setMenuFor(null) : changeType.mutate({ type, id: item.id, link_type: o.value, field: item.source === "field" ? (type === "prediction" ? item.id : self.id) : undefined })}
                              style={{ fontSize: 12, padding: "3px 10px", borderRadius: 999, cursor: "pointer", fontWeight: o.value === lt.value ? 600 : 400,
                                border: `1px solid ${o.value === lt.value ? o.color : ink.line}`, background: o.value === lt.value ? `${o.color}1f` : "transparent", color: o.value === lt.value ? readableOn(o.color) : ink.label }}>
                              {o.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  {removable && <button type="button" aria-label={t("relations.remove")} title={t("relations.remove")} disabled={remove.isPending}
                    onClick={() => remove.mutate({ type, id: item.id, title: item.title, link_type: item.link_type ?? "связано", competing: item.source === "competing", field: item.source === "field" ? (type === "prediction" ? item.id : self.id) : undefined })}
                    style={{ width: 40, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", border: "none", borderLeft: `1px solid ${ink.line}`, background: "transparent", color: ink.muted, cursor: "pointer" }}>
                    <X size={14} />
                  </button>}
                </div>
              )
            })}
          </div>
        </section>
      ))}

      <MentionGroup label={t("relations.mentions")} items={mentionsData?.mentions ?? []} typeRu={typeRu} makeLinkLabel={t("relations.makeLink")} pending={promote.isPending} onPromote={m => promote.mutate(m)} />
      <MentionGroup label={t("relations.mentionedIn")} items={mentionsData?.mentioned_in ?? []} typeRu={typeRu} makeLinkLabel={t("relations.makeLink")} pending={promote.isPending} onPromote={m => promote.mutate(m)} />

      {indirect.length > 0 && (
        <section aria-label={t("relations.indirect")}>
          <button type="button" aria-expanded={showIndirect} onClick={() => setShowIndirect(v => !v)}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 0", background: "none", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: ink.label }}>
            <ChevronDown size={14} aria-hidden style={{ transform: showIndirect ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
            {t("relations.indirect")} <span style={{ fontFamily: theme.mono, fontWeight: 400, color: ink.muted }}>{indirect.length}</span>
          </button>
          {showIndirect && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
              <div style={{ fontSize: 12, color: ink.muted, lineHeight: 1.5 }}>{t("relations.indirectHint")}</div>
              {indirect.map(({ type, item }) => {
                const parentTitle = item.parent_type ? (grouped[item.parent_type] ?? []).find(i => i.id === item.parent_id)?.title : undefined
                return (
                  <PreviewLink key={`${type}:${item.id}`} type={type} id={item.id} href={safeEntityHref(type, item.id)}
                    context={buildRelationContext(item, { t, linkTypes: allTypes, parentTitle })}
                    style={{ display: "flex", flexDirection: "column", gap: 2, padding: "8px 12px", borderRadius: 10, textDecoration: "none", background: ink.card, border: `1px solid ${ink.line}`, borderLeft: `3px solid ${typeColor[type] ?? "#555"}` }}>
                    <PreviewLinkTitle fontSize={13} color={theme.tx1}>{item.title}</PreviewLinkTitle>
                    <span style={{ fontSize: 12, color: ink.muted }}>{typeRu[type] ?? type} · {t("relations.via", { title: parentTitle ?? "…" })}</span>
                  </PreviewLink>
                )
              })}
            </div>
          )}
        </section>
      )}
      {batchErrors && (
        <div role="alert" style={{ padding: "10px 12px", borderRadius: 10, fontSize: 13, color: "#F5A623", background: "#F5A62310", border: "1px solid #F5A62344" }}>
          <div>{t("relations.batch.rejected")}</div>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{batchErrors.map((e, i) => <li key={i}>{`${e.title}: ${e.message}`}</li>)}</ul>
        </div>
      )}
      {failed && <div role="alert" style={{ padding: "10px 12px", borderRadius: 10, fontSize: 13, color: "#F5A623", background: "#F5A62310", border: "1px solid #F5A62344" }}>{t("relations.actionFailed")}</div>}
    </div>
  )
}
