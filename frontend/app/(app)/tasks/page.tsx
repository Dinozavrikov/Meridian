"use client"
import { askConfirmText } from "@/lib/confirm"
import { Suspense } from "react"
import { useState, useEffect, useRef } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { EntityLinkPicker, createLinksFor, type PendingLink } from "@/components/entities/entity-link-picker"
import { LocalImagePicker, uploadImagesFor } from "@/components/entities/images-tab"
import { taskApi, hypApi, api, sourceApi } from "@/lib/api"
import { useMyLabs } from "@/lib/use-my-labs"
import { useT } from "@/lib/i18n/useT"
import { buildTrashConfirmText } from "@/lib/trash-confirm"
import { useTranslatedField, useListContentTranslation, useContentT, type ContentTranslateItem } from "@/lib/i18n/useContentT"
import { useDynamicTranslate } from "@/lib/i18n/useDynamicT"
import { matchesVisibilityFilter } from "@/lib/entity-filters"
import { useEntityUrlSync } from "@/lib/use-entity-url-sync"
import { Header } from "@/components/layout/header"
import { Button } from "@/components/ui/button"
import { Modal } from "@/components/ui/modal"
import { Input, Textarea } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { PageShell, PageContent, SPLIT_BODY_STYLE } from "@/components/layout/page-shell"
import { ResizableLayout, useIsMobile } from "@/components/layout/resizable-layout"
import { DetailPanel, DetailPanelEmpty } from "@/components/layout/detail-panel"
import { EntityPage } from "@/components/layout/entity-page"
import { ActionButton } from "@/components/ui/action-button"
import { AuthorChip } from "@/components/entities/author-chip"
import { EntityPassport } from "@/components/entities/passport"
import { EntityKnowledge } from "@/components/entities/entity-knowledge"
import { useRelatedGroups } from "@/lib/use-related-groups"
import { resolveEntityTab, relatedTabsFor } from "@/lib/entity-tab"
import { EntityQuickAddMenu } from "@/components/entities/entity-quick-add-menu"
import { TaskCloseModal } from "@/components/entities/task-close-modal"
import { getVisibilityOptions } from "@/lib/visibility-levels"
import { ObservationsTab, PredictionsTab } from "@/components/entities/relations-panel"
import { WorldviewTab } from "@/components/entities/worldview-tab"
import { SourcesTab } from "@/components/hypotheses/sources-tab"
import { FilesTab } from "@/components/entities/files-tab"
import { EntityHistoryTab, historyTabs } from "@/components/entities/entity-history-tab"
import { statusBadge, typeColor, mono, sectionSearch, sectionSearchWrap, theme } from "@/lib/theme"
import { EntityConversation } from "@/components/entities/entity-conversation"
import { Plus, X, Search, Trash2, Pencil, ChevronRight, BarChart2, Link2, CheckCircle, XCircle, HelpCircle, ExternalLink, CheckSquare, Lock, FlaskConical, Globe, AlertTriangle } from "lucide-react"
import { ListFilters } from "@/components/entities/list-filters"
import { VisibilityTabs } from "@/components/entities/visibility-tabs"
import { type VisibilityValue } from "@/lib/visibility-levels"
import { StatusBadge } from "@/components/ui/status-badge"
import { formatEntityStampFull } from "@/lib/theme"
import { useStore } from "@/lib/store"
import { isOwner } from "@/lib/ownership"
import { PercentBar } from "@/components/ui/percent-bar"
import { EntityListItem } from "@/components/layout/entity-list-item"
import { usePagination, PaginationBar } from "@/components/layout/pagination"
import { EditDeleteActions } from "@/components/layout/entity-row-actions"
import { TYPE_COLORS } from "@/lib/utils"
import { ForceGraph, type ForceGraphNode, type ForceGraphEdge } from "@/components/graph/force-graph"

const STATUSES = ["открыта","исследуется","приостановлена","решена","закрыта"]

// ── Scale widget ───────────────────────────────────────────────────────────
function ScaleBar({ scale, onSetValue, onEdit, onDelete }: any) {
  const isMobile = useIsMobile()
  const t = useT()
  const [hov, setHov] = useState(false)
  const pct = Math.max(0, Math.min(100,
    ((scale.current_val - scale.min_val) / Math.max(1, scale.max_val - scale.min_val)) * 100
  ))
  const label = scale.value_labels?.[String(Math.round(scale.current_val))] ?? ""

  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ background: "#111118", border: "1px solid #1e1e2a", borderRadius: 10, padding: "14px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#c8c8e0" }}>{scale.name}</div>
          {scale.description && <div style={{ fontSize: 11, color: "#9696a5", marginTop: 2 }}>{scale.description}</div>}
          {scale.hypothesis_ids?.length > 0 && (
            <div style={{ fontSize: 10, color: "#7b8b9e", marginTop: 3 }}>
              привязана к {scale.hypothesis_ids.length} гипотез(е)
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 3, opacity: (isMobile || hov) ? 1 : 0, transition: "opacity 0.12s" }}>
          <button onClick={() => onEdit(scale)}
            style={{ padding: "3px 6px", border: "none", background: "transparent", color: "#888898", cursor: "pointer", borderRadius: 4 }}
            onMouseEnter={e => (e.currentTarget.style.color = "#aaa")}
            onMouseLeave={e => (e.currentTarget.style.color = "#9a9aa8")}>
            <Pencil size={11} />
          </button>
          <button onClick={async () => { if (await askConfirmText(t("tasks.scale.deleteConfirm"))) onDelete(scale.id) }}
            style={{ padding: "3px 6px", border: "none", background: "transparent", color: "#888898", cursor: "pointer", borderRadius: 4 }}
            onMouseEnter={e => (e.currentTarget.style.color = "#E74C3C")}
            onMouseLeave={e => (e.currentTarget.style.color = "#9a9aa8")}>
            <Trash2 size={11} />
          </button>
        </div>
      </div>
      {/* трек */}
      <div style={{ position: "relative", height: 6, borderRadius: 3, background: "#1e1e2a", marginBottom: 8 }}>
        <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${pct}%`, borderRadius: 3, background: typeColor.task, transition: "width 0.2s" }} />
      </div>
      {/* значение + ввод */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <input type="range"
          min={scale.min_val} max={scale.max_val} step={1}
          value={scale.current_val}
          onChange={e => onSetValue(scale.id, +e.target.value)}
          style={{ flex: 1, accentColor: typeColor.task, height: 4 }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
          <span style={{ ...mono(typeColor.task, 14), fontWeight: 700 }}>{scale.current_val}</span>
          <span style={{ fontSize: 11, color: "#888898" }}>{scale.unit || `/ ${scale.max_val}`}</span>
        </div>
      </div>
      {label && <div style={{ fontSize: 11, color: "#8888a0", marginTop: 4, fontStyle: "italic" }}>{label}</div>}
      {scale.auto_formula && (
        <div style={{ fontSize: 10, color: "#8a8a97", marginTop: 6, fontFamily: "monospace" }}>f: {scale.auto_formula}</div>
      )}
    </div>
  )
}

// ── Scale form ─────────────────────────────────────────────────────────────
function ScaleForm({ initial, taskHyps, onSave, onCancel }: any) {
  const t = useT()
  const [form, setForm] = useState({
    name: initial?.name ?? "",
    description: initial?.description ?? "",
    min_val: initial?.min_val ?? 0,
    max_val: initial?.max_val ?? 10,
    current_val: initial?.current_val ?? 0,
    unit: initial?.unit ?? "",
    auto_formula: initial?.auto_formula ?? "",
    hypothesis_ids: initial?.hypothesis_ids ?? [],
    value_labels: initial?.value_labels ?? {},
  })
  const [labelsRaw, setLabelsRaw] = useState(
    Object.entries(initial?.value_labels ?? {}).map(([k,v]) => `${k}=${v}`).join(", ")
  )
  const f = (k: string) => (e: any) => setForm(p => ({ ...p, [k]: e.target.value }))

  const toggleHyp = (id: number) => setForm(p => ({
    ...p,
    hypothesis_ids: p.hypothesis_ids.includes(id)
      ? p.hypothesis_ids.filter((x: number) => x !== id)
      : [...p.hypothesis_ids, id]
  }))

  const parseLabels = (raw: string) => {
    const obj: Record<string,string> = {}
    raw.split(",").forEach(pair => {
      const [k, ...rest] = pair.trim().split("=")
      if (k && rest.length) obj[k.trim()] = rest.join("=").trim()
    })
    return obj
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Input label={t("tasks.scale.nameLabel")} value={form.name} onChange={f("name")} placeholder={t("tasks.scale.namePlaceholder")} />
      <Textarea label={t("field.description")} value={form.description} onChange={f("description")} rows={2} placeholder={t("tasks.scale.descPlaceholder")} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        <Input label={t("field.minimum")} type="number" value={String(form.min_val)} onChange={e => setForm(p => ({...p, min_val: +e.target.value}))} />
        <Input label={t("field.maximum")} type="number" value={String(form.max_val)} onChange={e => setForm(p => ({...p, max_val: +e.target.value}))} />
        <Input label={t("field.unit")} value={form.unit} onChange={f("unit")} placeholder="%" />
      </div>
      <Input label={t("field.currentValue")} type="number" value={String(form.current_val)}
        onChange={e => setForm(p => ({...p, current_val: +e.target.value}))} />
      <div>
        <label style={{ fontSize: 12, color: "#888894", display: "block", marginBottom: 6 }}>
          Метки значений <span style={{ color: "#979797" }}>(формат: 0=Нет, 5=Средне, 10=Точно)</span>
        </label>
        <input value={labelsRaw} onChange={e => { setLabelsRaw(e.target.value); setForm(p => ({...p, value_labels: parseLabels(e.target.value)})) }}
          placeholder="0=Нет, 5=Неясно, 10=Да"
          style={{ width: "100%", background: "#181820", border: "1.5px solid #272730", borderRadius: 8, color: "#e0e0e0", padding: "9px 13px", fontSize: 13, outline: "none", fontFamily: "monospace" }} />
      </div>
      <Input label={t("field.autoFormula")} value={form.auto_formula} onChange={f("auto_formula")}
        placeholder="confirming / (confirming + refuting)" />
      {taskHyps?.length > 0 && (
        <div>
          <label style={{ fontSize: 12, color: "#888894", display: "block", marginBottom: 6 }}>{t("tasks.linkHypotheses")}</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {taskHyps.map((h: any) => (
              <div key={h.id} onClick={() => toggleHyp(h.id)}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 7, cursor: "pointer", background: form.hypothesis_ids.includes(h.id) ? "#4A90D912" : "#111", border: `1px solid ${form.hypothesis_ids.includes(h.id) ? "#4A90D930" : "#1e1e2a"}`, transition: "all 0.1s" }}>
                <div style={{ width: 14, height: 14, borderRadius: 3, border: `1.5px solid ${form.hypothesis_ids.includes(h.id) ? "#4A90D9" : "#333"}`, background: form.hypothesis_ids.includes(h.id) ? "#4A90D9" : "transparent", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {form.hypothesis_ids.includes(h.id) && <span style={{ color: "#fff", fontSize: 9, fontWeight: 700 }}>✓</span>}
                </div>
                <span style={{ fontSize: 13, color: form.hypothesis_ids.includes(h.id) ? "#c0c8e0" : "#9898a2" }}>{h.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Button type="button" variant="ghost" onClick={onCancel}>{t("actions.cancel")}</Button>
        <Button type="button" variant="primary" onClick={() => onSave(form)}>{t("actions.save")}</Button>
      </div>
    </div>
  )
}


// ── Hypothesis Sources Mini Panel ─────────────────────────────────────────
function HypSourcesMini({ hypId }: { hypId: number }) {
  const t = useT()
  const { data: sources = [], isLoading } = useQuery({
    queryKey: ["sources", hypId],
    queryFn: () => sourceApi.list("hypotheses", hypId),
    refetchInterval: (q: any) => {
      const d = q.state.data
      return Array.isArray(d) && d.some((s: any) => s.status === "pending" || s.status === "processing") ? 2500 : false
    },
  })

  const verdictCfg: Record<string, { color: string; Icon: any; label: string }> = {
    confirms: { color: "#1ABC9C", Icon: CheckCircle, label: t("relation.confirms") },
    refutes:  { color: "#E74C3C", Icon: XCircle,    label: t("relation.refutes")  },
    unclear:  { color: "#E8A838", Icon: HelpCircle,  label: t("relation.unclear") },
    pending:  { color: "#9696a2", Icon: HelpCircle,  label: t("relation.pending")    },
  }

  if (isLoading) return (
    <div style={{ padding: "12px 0", textAlign: "center", color: "#9999a1", fontSize: 12 }}>Загрузка...</div>
  )

  const confirms = sources.filter((s: any) => s.verdict === "confirms" && s.status === "done").length
  const refutes  = sources.filter((s: any) => s.verdict === "refutes"  && s.status === "done").length

  return (
    <div style={{ marginTop: 14, borderTop: "1px solid #0d0d18", paddingTop: 14 }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <Link2 size={11} style={{ color: "#9696a2" }} />
        <span style={{ fontSize: 10, fontWeight: 700, color: "#9999a1", letterSpacing: "0.08em", textTransform: "uppercase" }}>
          Источники
        </span>
        {sources.length > 0 && (
          <div style={{ display: "flex", gap: 6, marginLeft: 4 }}>
            {confirms > 0 && <span style={{ fontSize: 10, color: "#1ABC9C" }}>✓ {confirms}</span>}
            {refutes  > 0 && <span style={{ fontSize: 10, color: "#E74C3C" }}>✗ {refutes}</span>}
            <span style={{ fontSize: 10, color: "#9999a1" }}>({sources.length})</span>
          </div>
        )}
      </div>

      {sources.length === 0 ? (
        <div style={{ textAlign: "center", padding: "16px 0", color: "#181828", fontSize: 12 }}>
          Нет источников у этой гипотезы
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 5, maxHeight: 220, overflowY: "auto" }}>
          {(sources as any[]).map((src: any) => {
            const cfg = verdictCfg[src.status === "done" ? src.verdict : "pending"] ?? verdictCfg.pending
            const wc  = src.source_weight >= 8 ? "#1ABC9C" : src.source_weight >= 5 ? "#4A90D9" : "#E8A838"
            let host = src.url
            try { host = new URL(src.url).hostname.replace("www.", "") } catch {}
            return (
              <div key={src.id} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "9px 12px", borderRadius: 8,
                background: `${cfg.color}08`,
                border: `1px solid ${cfg.color}18`,
                transition: "border-color 0.12s",
              }}>
                {/* вес */}
                <div style={{
                  width: 28, height: 28, borderRadius: 7, flexShrink: 0,
                  background: `${wc}14`, border: `1px solid ${wc}28`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, fontWeight: 700, color: wc, fontFamily: "monospace",
                }}>
                  {src.status === "done" ? src.source_weight : "…"}
                </div>
                {/* инфо */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 11, color: "#a0a0b8", fontWeight: 500,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 2,
                  }} title={src.title || host}>
                    {src.title || host}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <cfg.Icon size={9} style={{ color: cfg.color }} />
                    <span style={{ fontSize: 10, color: cfg.color }}>{cfg.label}</span>
                    {src.summary && (
                      <span title={src.summary} style={{ fontSize: 10, color: "#9999a1", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220 }}>
                        · {src.summary.slice(0, 80)}…
                      </span>
                    )}
                  </div>
                </div>
                {/* ссылка */}
                <a href={src.url} target="_blank" rel="noopener noreferrer"
                  style={{ color: "#96969d", flexShrink: 0, display: "flex", transition: "color 0.12s" }}
                  onMouseEnter={e => (e.currentTarget.style.color = "#4A90D9")}
                  onMouseLeave={e => (e.currentTarget.style.color = "#9a9aa1")}>
                  <ExternalLink size={11} />
                </a>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Task graph tab ────────────────────────────────────────────────────────────
export function TaskGraphTab({ taskId }: { taskId: number }) {
  const t = useT()
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["task-graph", taskId],
    queryFn: () => api.get(`/api/v1/tasks/${taskId}/graph`).then(r => r.data),
    staleTime: 0,
  })

  const verdictColor = (v: string) =>
    v === "confirms" ? "#1ABC9C" : v === "refutes" ? "#E74C3C" : "#E8A838"

  const nodeColorFor = (d: any) => {
    if (d.type === "source") return verdictColor(d.verdict ?? "unclear")
    return (TYPE_COLORS as any)[d.type] ?? "#555"
  }
  const nodeRadiusFor = (d: any) =>
    d.type === "task" ? 16 : d.type === "source" ? Math.max(5, Math.min(12, (d.weight ?? 5))) : 9

  const edgeColorForTask = (e: any) => {
    const lt = e.linkType
    return lt === "confirms" ? "#1ABC9C44" : lt === "refutes" ? "#E74C3C44" : lt === "unclear" ? "#E8A83844" : "#2a2a3a"
  }
  const edgeDashForTask = (e: any) =>
    ["confirms", "refutes", "unclear"].includes(e.linkType ?? "") ? "4,3" : null

  // is_own/entity_id приходят с бэкенда на каждом узле (см.
  // get_task_graph) — задача, гипотеза и источник могут принадлежать
  // разным людям одновременно, observation/prediction узлы здесь всегда
  // свои по построению запроса (см. комментарии в tasks.py). "source"
  // переводим через entityType="source_document" — тот же паттерн,
  // что и в sources-tab.tsx/result-source-picker.tsx.
  const { ct: ctGraph, ensure: ensureGraph } = useContentT()
  const rawNodes: any[] = data?.nodes ?? []
  const graphIdsKey = rawNodes.map((n: any) => `${n.type}:${n.entity_id}`).join(",")
  useEffect(() => {
    const items: ContentTranslateItem[] = rawNodes
      .filter((n: any) => !n.is_own && n.label)
      .map((n: any) => ({
        entityType: n.type === "source" ? "source_document" : n.type,
        entityId: n.entity_id,
        field: "label",
        text: n.label,
      }))
    ensureGraph(items)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphIdsKey])

  const nodes: ForceGraphNode[] = rawNodes.map((n: any) => ({
    id: n.id, label: n.is_own ? (n.label ?? "") : ctGraph(n.type === "source" ? "source_document" : n.type, n.entity_id, "label", n.label ?? ""),
    type: n.type, entityId: n.entity_id,
    verdict: n.verdict, weight: n.weight,
  }))
  const nodeById = new Set(nodes.map(n => n.id))
  const edges: ForceGraphEdge[] = (data?.edges ?? [])
    .filter((e: any) => nodeById.has(e.from) && nodeById.has(e.to))
    .map((e: any) => ({ source: e.from, target: e.to, linkType: e.link_type }))

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button onClick={() => refetch()} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, border: "1px solid #1e1e2a", background: "transparent", color: "#888898", cursor: "pointer" }}>⟳ Обновить</button>
      </div>
      {isLoading
        ? <div style={{ color: "#979797", fontSize: 13, textAlign: "center", padding: 32 }}>Загрузка...</div>
        : <>
            <div style={{ width: "100%", height: 460, background: "#0a0a10", borderRadius: 8, border: "1px solid #1a1a28" }}>
              <ForceGraph
                nodes={nodes}
                edges={edges}
                nodeRadius={9}
                colorForNode={nodeColorFor}
                radiusForNode={nodeRadiusFor}
                colorForEdge={edgeColorForTask}
                dashForEdge={edgeDashForTask}
              />
            </div>
            <div style={{ display: "flex", gap: 16, marginTop: 8, flexWrap: "wrap" }}>
              {([
                ["#4A90D9", t("legend.hypothesis")],
                ["#F39C12", t("legend.task")],
                ["#1ABC9C", t("legend.sourceConfirms")],
                ["#E74C3C", t("legend.sourceRefutes")],
                ["#E8A838", t("legend.sourceUnclear")],
                ["#9B59B6", t("legend.observation")],
              ] as [string,string][]).map(([c, l]) => (
                <div key={l} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: `${c}30`, border: `1.5px solid ${c}` }} />
                  <span style={{ fontSize: 9, color: "#9696a2" }}>{l}</span>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 16, marginTop: 4, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <div style={{ width: 16, height: 0, borderTop: "2px dashed #8888a0" }} />
                <span style={{ fontSize: 9, color: "#9696a2" }}>{t("tasks.legendDashed")}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <div style={{ width: 16, height: 2, background: "#2a2a3a", borderRadius: 1 }} />
                <span style={{ fontSize: 9, color: "#9696a2" }}>{t("tasks.legendSolid")}</span>
              </div>
            </div>
          </>}
    </div>
  )
}

// ── Competing hypotheses tab ───────────────────────────────────────────────
export function CompetingHypsTab({ parentId, allHyps, canEdit = true, parentType = "task" }: {
  parentId: number; allHyps: any[]; canEdit?: boolean; parentType?: "task" | "question"
}) {
  const t = useT()
  const qc = useQueryClient()
  const accent = typeColor.task
  const [search, setSearch]       = useState("")
  const [showSearch, setShowSearch] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [scaleHypId, setScaleHypId] = useState<number | null>(null)

  const { data: linked = [] } = useQuery({
    queryKey: [parentType, "hyps", parentId],
    queryFn: () => api.get(`/api/v1/${parentType}s/${parentId}/hypotheses`).then(r => r.data),
    staleTime: 0, refetchOnMount: "always",
  })
  const { data: competition = [], refetch: refetchComp } = useQuery({
    queryKey: [parentType, "competition", parentId],
    queryFn: () => api.get(`/api/v1/${parentType}s/${parentId}/competition`).then(r => r.data),
    staleTime: 0, refetchOnMount: "always",
  })
  const { data: scales = [] } = useQuery({
    queryKey: [parentType, "scales", parentId],
    queryFn: () => api.get(`/api/v1/${parentType}s/${parentId}/scales`).then(r => r.data),
    enabled: parentType === "task",
  })

  const add = useMutation({
    mutationFn: (hid: number) => api.post(`/api/v1/${parentType}s/${parentId}/hypotheses/${hid}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [parentType, "hyps", parentId] }); qc.invalidateQueries({ queryKey: [parentType, "competition", parentId] }) },
  })
  const remove = useMutation({
    mutationFn: (hid: number) => api.delete(`/api/v1/${parentType}s/${parentId}/hypotheses/${hid}`),
    onSuccess: () => { setSelectedId(null); qc.invalidateQueries({ queryKey: [parentType, "hyps", parentId] }); qc.invalidateQueries({ queryKey: [parentType, "competition", parentId] }) },
  })
  const setValue = useMutation({
    mutationFn: ({ sid, value }: any) => api.patch(`/api/v1/${parentType}s/${parentId}/scales/${sid}/value`, { value }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [parentType, "scales", parentId] }); qc.invalidateQueries({ queryKey: [parentType, "competition", parentId] }) },
  })

  const linkedIds = new Set(linked.map((h: any) => h.id))
  const filtered  = allHyps.filter(h => !linkedIds.has(h.id) && h.name.toLowerCase().includes(search.toLowerCase()))
  const scoreColor = (s: number) => s > 0 ? "#2ECC71" : s < 0 ? "#E74C3C" : "#444"
  const col = (c: string) => ({ color: c, fontSize: 12, fontFamily: "monospace", textAlign: "center" as const, padding: "11px 8px", borderBottom: "1px solid #0d0d16" })
  const selectedHyp = competition.find((h: any) => h.id === selectedId)

  // ── action bar buttons ──────────────────────────────────────────────────
  const btnBase = (bg: string, fg: string, disabled = false) => ({
    display: "flex", alignItems: "center", gap: 5,
    padding: "7px 14px", borderRadius: 7, border: "none",
    background: disabled ? "#1a1a24" : bg,
    color: disabled ? "#9f9fa6" : fg,
    cursor: disabled ? "not-allowed" : "pointer",
    fontSize: 12, fontWeight: 600,
    boxShadow: disabled ? "none" : `0 2px 8px ${bg}55`,
    transition: "all 0.12s",
  } as React.CSSProperties)

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>

      {/* ── action bar ──────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 0 14px", flexWrap: "wrap" }}>
        <button style={btnBase("#4A90D9", "#fff", !canEdit)} onClick={() => canEdit && setShowSearch(s => !s)}
          title={canEdit ? undefined : t("tasks.needAdminRole")}>
          <Plus size={12} /> {t("actions.addHypothesis")}
        </button>
        <button style={btnBase("#E74C3C", "#fff", !selectedId || !canEdit)}
          onClick={() => canEdit && selectedId && remove.mutate(selectedId)}>
          <X size={12} /> Убрать
        </button>
        {parentType === "task" && (
          <button style={btnBase("#E84393", "#fff", !selectedId || scales.length === 0)}
            onClick={() => selectedId && scales.length > 0 && setScaleHypId(selectedId)}>
            <BarChart2 size={12} /> Выставить шкалы
          </button>
        )}
        <button onClick={() => refetchComp()}
          style={{ marginLeft: "auto", padding: "7px 10px", borderRadius: 7, border: "1px solid #1e1e2a", background: "transparent", color: "#96969e", cursor: "pointer", fontSize: 12 }}>⟳</button>
      </div>

      {/* ── search dropdown ─────────────────────────────────────────────── */}
      {showSearch && (
        <div style={{ background: "#0e0e16", border: "1px solid #1e1e2a", borderRadius: 10, overflow: "hidden", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderBottom: "1px solid #1a1a24" }}>
            <Search size={12} style={{ color: "#9696a1" }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t("tasks.searchHypotheses")} autoFocus
              style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: 13, color: "#e0e0e0" }} />
            <button onClick={() => setShowSearch(false)} style={{ background: "none", border: "none", color: "#979797", cursor: "pointer" }}><X size={12} /></button>
          </div>
          <div style={{ maxHeight: 220, overflowY: "auto" }}>
            {filtered.slice(0, 20).map((h: any) => (
              <div key={h.id} onClick={() => { add.mutate(h.id); setShowSearch(false); setSearch("") }}
                style={{ padding: "10px 14px", cursor: "pointer", borderBottom: "1px solid #0d0d14", fontSize: 13, color: "#9797a3", display: "flex", alignItems: "center", gap: 8 }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#141420"; (e.currentTarget as HTMLElement).style.color = "#e0e0e0" }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "#9b9ba6" }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#4A90D940", flexShrink: 0 }} />
                {h.name}
              </div>
            ))}
            {filtered.length === 0 && <div style={{ padding: 16, textAlign: "center", color: "#8a8a93", fontSize: 12 }}>Ничего не найдено</div>}
          </div>
        </div>
      )}

      {/* ── table ───────────────────────────────────────────────────────── */}
      {competition.length === 0 ? (
        <div style={{ textAlign: "center", padding: "48px 0", color: "#96969d", fontSize: 13 }}>
          Нет конкурирующих гипотез — добавьте через кнопку выше
        </div>
      ) : (
        <div style={{ border: "1px solid #141420", borderRadius: 10, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#08080f" }}>
                {[t("tasks.tableHead.num"), t("tasks.tableHead.hypothesis"), t("field.status"), "✓", "✗", t("tasks.tableHead.score"), t("tabs.scales")].map((h, i) => (
                  <th key={i} style={{ padding: "9px 8px", fontSize: 10, color: "#9999a1", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", textAlign: i <= 1 ? "left" : "center", borderBottom: "1px solid #111" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {competition.map((h: any, i: number) => {
                const isSelected = h.id === selectedId
                const sc = scoreColor(h.evidence_score)
                const rowBg = isSelected ? `${accent}14` : i % 2 === 0 ? "transparent" : "#07070e"
                return (
                  <tr key={h.id}
                    onClick={() => setSelectedId(isSelected ? null : h.id)}
                    style={{ background: rowBg, cursor: "pointer", borderLeft: `2px solid ${isSelected ? accent : "transparent"}`, transition: "all 0.1s" }}
                    onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = "#0d0d1a" }}
                    onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = rowBg }}>
                    <td style={{ ...col(isSelected ? accent : "#303048"), width: 32, fontWeight: isSelected ? 700 : 400 }}>#{i + 1}</td>
                    <td style={{ padding: "11px 8px", borderBottom: "1px solid #0d0d16", maxWidth: 260 }}>
                      <div style={{ fontSize: 12, color: isSelected ? "#e8e8f8" : "#9090a8", lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: isSelected ? 600 : 400 }} title={h.name}>{h.name}</div>
                    </td>
                    <td style={{ ...col("#555"), whiteSpace: "nowrap" }}>
                      <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 4,
                        background: h.status === "подтверждена" ? "#2ECC7118" : h.status === "опровергнута" ? "#E74C3C18" : "#E8A02018",
                        color:      h.status === "подтверждена" ? "#2ECC71"   : h.status === "опровергнута" ? "#E74C3C"   : "#E8A020",
                        border: `1px solid ${h.status === "подтверждена" ? "#2ECC7130" : h.status === "опровергнута" ? "#E74C3C30" : "#E8A02030"}`
                      }}>{h.status}</span>
                    </td>
                    <td style={col("#2ECC71")}>{h.confirming}</td>
                    <td style={col("#E74C3C")}>{h.refuting}</td>
                    <td style={{ ...col(sc), fontWeight: 600 }}>{h.evidence_score > 0 ? "+" : ""}{h.evidence_score} / {h.support_pct}%</td>
                    <td style={col("#4A90D9")}>{h.scale_avg}/10</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── hint ────────────────────────────────────────────────────────── */}
      {competition.length > 0 && (
        <div style={{ fontSize: 10, color: "#1a1a2a", marginTop: 8 }}>
          {selectedId ? t("tasks.hypRow.selected", { name: selectedHyp?.name?.slice(0, 60) ?? "" }) : t("tasks.hypRow.hint")}
        </div>
      )}

      {/* источники выбранной гипотезы */}
      {selectedId && <HypSourcesMini hypId={selectedId} />}

      {/* ── scale modal ─────────────────────────────────────────────────── */}
      {scaleHypId !== null && (
        <Modal open={true} onClose={() => setScaleHypId(null)}
          title={`Шкалы: ${competition.find((h: any) => h.id === scaleHypId)?.name?.slice(0, 50)}`} size="md">
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <p style={{ fontSize: 12, color: "#96969e", margin: 0 }}>{t("tasks.scalesHint")}</p>
            {scales.map((s: any) => (
              <div key={s.id} style={{ background: "#0a0a12", border: "1px solid #1a1a28", borderRadius: 8, padding: "14px 16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <span style={{ fontSize: 13, color: "#c0c0d0", fontWeight: 600 }}>{s.name}</span>
                  <span style={{ fontSize: 13, color: accent, fontFamily: "monospace", fontWeight: 700 }}>{s.current_val}/{s.max_val}</span>
                </div>
                <input type="range" min={s.min_val} max={s.max_val} step={1}
                  defaultValue={s.current_val}
                  onChange={e => setValue.mutate({ sid: s.id, value: parseFloat(e.target.value) })}
                  style={{ width: "100%", accentColor: accent }} />
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#9999a1", marginTop: 4 }}>
                  <span>{s.min_val}</span><span>{s.max_val}</span>
                </div>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button onClick={() => setScaleHypId(null)} style={{ ...btnBase("#4A90D9", "#fff"), padding: "8px 20px" }}>Готово</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}


// ── Scales tab ─────────────────────────────────────────────────────────────
export function ScalesTab({ taskId, taskHyps }: { taskId: number; taskHyps: any[] }) {
  const t = useT()
  const qc = useQueryClient()
  const [scaleModal, setScaleModal] = useState<null | "create" | any>(null)

  const { data: scales = [] } = useQuery({
    queryKey: ["task-scales", taskId],
    queryFn: () => api.get(`/api/v1/tasks/${taskId}/scales`).then(r => r.data),
  })

  const createScale = useMutation({
    mutationFn: (d: any) => api.post(`/api/v1/tasks/${taskId}/scales`, d).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["task-scales", taskId] }); setScaleModal(null) },
  })
  const updateScale = useMutation({
    mutationFn: ({ sid, d }: any) => api.put(`/api/v1/tasks/${taskId}/scales/${sid}`, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["task-scales", taskId] }); setScaleModal(null) },
  })
  const deleteScale = useMutation({
    mutationFn: (sid: number) => api.delete(`/api/v1/tasks/${taskId}/scales/${sid}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["task-scales", taskId] }),
  })
  const setValue = useMutation({
    mutationFn: ({ sid, value }: any) => api.patch(`/api/v1/tasks/${taskId}/scales/${sid}/value`, { value }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["task-scales", taskId] }),
  })

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button onClick={() => setScaleModal("create")}
          style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 12px", borderRadius: 6, border: "1px solid #1e1e2a", background: "transparent", color: "#888898", cursor: "pointer", fontSize: 11, transition: "all 0.12s" }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = typeColor.task; (e.currentTarget as HTMLElement).style.color = typeColor.task }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "#1e1e2a"; (e.currentTarget as HTMLElement).style.color = "#9a9aa8" }}>
          <BarChart2 size={11} /> {t("actions.addScale")}
        </button>
      </div>

      {scales.length === 0 ? (
        <div style={{ textAlign: "center", padding: "32px 0", color: "#8a8a93", fontSize: 13 }}>
          Нет шкал — добавьте для измерения прогресса
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {scales.map((s: any) => (
            <ScaleBar key={s.id} scale={s}
              onSetValue={(sid: number, val: number) => setValue.mutate({ sid, value: val })}
              onEdit={(s: any) => setScaleModal(s)}
              onDelete={(sid: number) => deleteScale.mutate(sid)}
            />
          ))}
        </div>
      )}

      <Modal open={!!scaleModal} onClose={() => setScaleModal(null)}
        title={scaleModal === "create" ? t("tasks.scale.createTitle") : t("tasks.scale.editTitle")} size="md">
        <ScaleForm
          initial={scaleModal !== "create" ? scaleModal : undefined}
          taskHyps={taskHyps}
          onSave={(d: any) => scaleModal === "create"
            ? createScale.mutate(d)
            : updateScale.mutate({ sid: scaleModal.id, d })}
          onCancel={() => setScaleModal(null)}
        />
      </Modal>
    </div>
  )
}

// ── Detail panel ───────────────────────────────────────────────────────────
export function TaskDetail({ task, allHyps, onEdit, canEdit = true, extraTabs, renderExtraTab, hypothesesTabContent, tab: controlledTab, setTab: setControlledTab }: {
  task: any; allHyps: any[]; onEdit?: () => void; canEdit?: boolean
  extraTabs?: import("@/components/layout/entity-header").EntityTab[]
  renderExtraTab?: (tabId: string) => React.ReactNode
  hypothesesTabContent?: React.ReactNode
  tab?: string
  setTab?: (t: string) => void
}) {
  const t = useT()
  const user = useStore(s => s.user)
  const locale = useStore(s => s.locale)
  const qc = useQueryClient()
  const [internalTab, setInternalTab] = useState("detail")
  const tab = resolveEntityTab(controlledTab ?? internalTab)
  const setTab = setControlledTab ?? setInternalTab
  const accent = typeColor.task
  const owner = isOwner(user, task)
  const { counts } = useRelatedGroups("task", task.id)

  const updateScale = useMutation({
    mutationFn: (patch: Record<string, number | null>) =>
      taskApi.update(task.id, {
        name: task.name, description: task.description, status: task.status,
        visibility: task.visibility, lab_id: task.lab_id, ...patch,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  })

  const [closeModalOpen, setCloseModalOpen] = useState(false)
  const [justClosedExpectation, setJustClosedExpectation] = useState<{ check_at: string } | null>(null)
  const closeTask = useMutation({
    mutationFn: (d: { expectation_confidence: number; expectation_text: string; check_in_days?: number; check_at?: string } | null) =>
      taskApi.closeWithExpectation(task.id, d),
    onSuccess: (result: any) => {
      qc.invalidateQueries({ queryKey: ["tasks"] })
      setCloseModalOpen(false)
      if (result) {
        setJustClosedExpectation({ check_at: result.check_at })
        qc.invalidateQueries({ queryKey: ["comments", "task", task.id] })
      }
    },
  })
  const canClose = owner && task.status !== "решена" && task.status !== "закрыта"
  const translatedName = useTranslatedField("task", task.id, "name", task.name, owner)
  const translatedDescription = useTranslatedField("task", task.id, "description", task.description, owner)

  const { data: taskHyps = [] } = useQuery({
    queryKey: ["task-hyps", task.id],
    queryFn: () => api.get(`/api/v1/tasks/${task.id}/hypotheses`).then(r => r.data),
    staleTime: 0,
    refetchOnMount: "always",
  })

  return (
    <>
      <EntityPage
        accent={accent}
        icon={<CheckSquare size={14} />}
        kicker={t("tasks.kicker")}
        dateStr={formatEntityStampFull(task.created_at, locale) ?? ""}
        title={translatedName}
        actions={
          <>
            {onEdit && (
              <ActionButton variant="primary" accent={accent} icon={<Pencil size={14} />} onClick={onEdit}>
                {t("actions.edit")}
              </ActionButton>
            )}
            {canClose && (
              <ActionButton accent={accent} icon={<CheckCircle size={14} />} onClick={() => setCloseModalOpen(true)}>
                {t("taskClose.button")}
              </ActionButton>
            )}
            {user && <EntityQuickAddMenu entityType="task" entityId={task.id} entityName={task.name} />}
          </>
        }
        insights={
          !canClose && justClosedExpectation ? (
            <div style={{
              display: "flex", alignItems: "center", gap: 8, alignSelf: "flex-start",
              fontSize: 12, padding: "6px 12px", borderRadius: 7,
              border: "1px solid #27AE6040", background: "#27AE6012", color: "#27AE60",
            }}>
              <CheckCircle size={13} />
              {t("taskClose.savedConfirmation", { date: formatEntityStampFull(justClosedExpectation.check_at, locale) ?? "" })}
            </div>
          ) : undefined
        }
        passport={compact => (
          <EntityPassport
            entityType="task"
            entityId={task.id}
            values={task}
            onSave={patch => updateScale.mutate(patch)}
            isPending={updateScale.isPending}
            isOwner={owner}
            accent={accent}
            compact={compact}
            meta={[
              { label: t("passport.status"), node: <StatusBadge status={task.status} fontSize={12} /> },
              ...((task.owner_display_name || task.owner_username) ? [{
                label: t("passport.author"),
                node: <AuthorChip name={task.owner_display_name || task.owner_username} username={task.owner_username} />,
              }] : []),
            ]}
          />
        )}
        tabs={[
          { id: "detail", label: t("tabs.detail") },
          { id: "hypotheses", label: t("tabs.hypotheses"), badge: taskHyps.length > 0 ? <span style={{ fontSize: 10, padding: "1px 5px", borderRadius: 3, background: accent + "20", color: accent }}>{taskHyps.length}</span> : undefined },
          { id: "graph", label: t("tabs.graph") },
          { id: "scales", label: t("tasks.scalesTabLabel") },
          { id: "observations", label: t("tabs.observations"), count: counts.observation },
          { id: "predictions", label: t("tabs.predictions"), count: counts.prediction },
          { id: "worldview", label: t("tabs.worldview"), count: counts.worldview },
          { id: "sources", label: t("tabs.sources") },
          { id: "images", label: t("tabs.files") },
          ...historyTabs(t, owner),
          ...(extraTabs ?? []),
        ]}
        activeTab={tab}
        onTabChange={setTab}
        scrollKey={task.id}
      >
        {tab === "detail" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 24, minWidth: 0 }}>
            {task.description ? (
              <div style={{ fontSize: 16, color: "#d4d2cd", lineHeight: 1.75, maxWidth: 760, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                {translatedDescription}
              </div>
            ) : (
              <p style={{ fontSize: 13, color: theme.tx4, margin: 0 }}>Описание не добавлено</p>
            )}
            <EntityKnowledge
              entityType="task"
              entityId={task.id}
              entityTitle={translatedName}
              accent={accent}
              addAction={user ? <EntityQuickAddMenu entityType="task" entityId={task.id} entityName={task.name} /> : undefined}
              tabForType={relatedTabsFor("task")}
              onOpenTab={setTab}
            />
            <div style={{ borderTop: "1px solid #262b42", paddingTop: 24, minWidth: 0 }}>
              <EntityConversation entityType="task" entity={task} accent={accent} />
            </div>
          </div>
        )}
        {tab === "hypotheses" && (
          hypothesesTabContent ?? <CompetingHypsTab parentId={task.id} parentType="task" allHyps={allHyps} canEdit={canEdit} />
        )}
        {tab === "graph" && <TaskGraphTab taskId={task.id} />}
        {tab === "scales" && (
          <>
            <p style={{ fontSize: 12, color: "#888898", margin: "0 0 16px", lineHeight: 1.5 }}>
              {t("tasks.scalesHint")}
            </p>
            <ScalesTab taskId={task.id} taskHyps={taskHyps} />
          </>
        )}
        {tab === "observations" && <ObservationsTab entityType="task" entityId={task.id} entityName={task.name} />}
        {tab === "predictions" && <PredictionsTab entityType="task" entityId={task.id} entityName={task.name} />}
        {tab === "worldview" && <WorldviewTab entityType="task" entityId={task.id} entityName={task.name} />}
        {tab === "sources" && <SourcesTab entityType="task" entityId={task.id} entityName={task.name} canEdit={canEdit} />}
        {tab === "history" && <EntityHistoryTab entityType="task" entityId={task.id} isOwner={owner} />}
        {tab === "images" && <FilesTab entityType="task" entityId={task.id} isOwner={owner} />}
        {renderExtraTab && renderExtraTab(tab)}
      </EntityPage>
      <TaskCloseModal
        open={closeModalOpen}
        onClose={() => setCloseModalOpen(false)}
        onConfirm={d => closeTask.mutate(d)}
        isPending={closeTask.isPending}
      />
    </>
  )
}

// ── Task form ──────────────────────────────────────────────────────────────
function TaskForm({ initial, onSave, onCancel, labs }: any) {
  const t = useT()
  const dt = useDynamicTranslate(STATUSES, { noYo: true })
  const [form, setForm] = useState({
    name: initial?.name ?? "", description: initial?.description ?? "",
    status: initial?.status ?? "открыта",
    visibility: initial?.visibility ?? "private",
    lab_id: initial?.lab_id ?? null,
    progress: initial?.progress ?? 0,
  })
  const [links, setLinks] = useState<PendingLink[]>([])
  const [images, setImages] = useState<File[]>([])
  const f = (k: string) => (e: any) => setForm(p => ({ ...p, [k]: e.target.value }))
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Input label={t("field.name")} placeholder={t("tasks.namePlaceholder")} value={form.name} onChange={f("name")} />
      <Textarea label={t("field.description")} placeholder={t("tasks.descPlaceholder")} value={form.description} onChange={f("description")} rows={4} />
      <Select label={t("field.status")} value={form.status} onChange={f("status")} options={STATUSES.map(s=>({value:s,label:dt(s)}))} />
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <label style={{ fontSize: 12, color: "#9696a1" }}>{t("field.visibility")}</label>
        {form.lab_id ? (
          // Задача привязана к лабе — видимость больше не выбирается вручную,
          // она полностью наследуется от публичности лабы (см. visibility_from_lab
          // на бэкенде). Показываем производное состояние как факт, не как контрол.
          (() => {
            const selectedLab = labs?.find((l: any) => String(l.id) === String(form.lab_id))
            const derivedVisibility = selectedLab?.is_public ? "public" : "lab"
            const opt = getVisibilityOptions(t, typeColor.task).find(o => o.value === derivedVisibility)!
            const Icon = opt.icon
            const becomingPublic = derivedVisibility === "public" && initial?.visibility !== "public"
            return (
              <>
                <div style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "10px 12px",
                  borderRadius: 9, border: `1px solid ${opt.color}30`, background: `${opt.color}0c`,
                }}>
                  <Icon size={14} color={opt.color} />
                  <span style={{ fontSize: 12, color: opt.color, fontWeight: 600 }}>{opt.label}</span>
                  <span style={{ fontSize: 11, color: "#9696a1" }}>— определяется лабой «{selectedLab?.name ?? "…"}»</span>
                  <button type="button" onClick={() => setForm(p => ({ ...p, lab_id: null, visibility: "private" }))}
                    style={{ marginLeft: "auto", background: "none", border: "none", color: "#9696a1", fontSize: 11, cursor: "pointer", textDecoration: "underline" }}>
                    Отвязать от лабы
                  </button>
                </div>
                {becomingPublic && (
                  <div style={{
                    display: "flex", alignItems: "flex-start", gap: 8, padding: "10px 12px",
                    borderRadius: 9, border: "1px solid #F5A62340", background: "#F5A62312",
                  }}>
                    <AlertTriangle size={15} color="#F5A623" style={{ flexShrink: 0, marginTop: 1 }} />
                    <span style={{ fontSize: 12, color: "#F5D090", lineHeight: 1.4 }}>
                      Задача становится <strong>публичной</strong> — лаба «{selectedLab?.name}» публичная, и это распространяется на все ее цели.
                    </span>
                  </div>
                )}
              </>
            )
          })()
        ) : (
          <>
            <div style={{ display: "flex", gap: 8 }}>
              {getVisibilityOptions(t, typeColor.task).map(({ value: v, label, icon: Icon, color }) => (
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
            {form.visibility === "lab" && labs?.length > 0 && (
              <select value={form.lab_id ?? ""} onChange={e => setForm(p => ({ ...p, lab_id: e.target.value || null }))}
                style={{ background: "#0d0d18", border: "1px solid #1e1e2c", borderRadius: 8, padding: "8px 12px", color: "#c0c0d8", fontSize: 13, outline: "none" }}>
                <option value="">Выберите лабораторию</option>
                {labs.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            )}
          </>
        )}
      </div>
      <div>
        <label style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#9393b5", marginBottom: 6 }}>
          <span>{t("tasks.progressLabel2")}</span>
          <span style={{ color: typeColor.task, fontWeight: 700 }}>{form.progress}%</span>
        </label>
        <input
          type="range" min={0} max={100} step={5}
          value={form.progress}
          onChange={e => setForm(p => ({ ...p, progress: Number(e.target.value) }))}
          style={{ width: "100%", accentColor: typeColor.task }}
        />
      </div>
      <EntityLinkPicker value={links} onChange={setLinks} excludeType="task" excludeId={initial?.id} />
      <LocalImagePicker value={images} onChange={setImages} />
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Button type="button" variant="ghost" onClick={onCancel}>{t("actions.cancel")}</Button>
        <Button type="button" variant="primary" onClick={() => onSave({ ...form, _links: links, _images: images })}>{t("actions.save")}</Button>
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────
function TasksPageInner() {
  const tr = useT()
  const user = useStore(s => s.user)
  const qc = useQueryClient()
  const { data = [], isLoading } = useQuery({ queryKey: ["tasks"], queryFn: taskApi.list })
  const { data: labs = [] } = useMyLabs()
  const { data: allHyps = [] } = useQuery({ queryKey: ["hypotheses"], queryFn: () => hypApi.list() })
  const [selected, setSelected] = useState<any>(null)
  const [taskSearch, setTaskSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<Record<string, boolean>>({})
  // Гость по умолчанию видит "Публичное" — вкладка "Личное" для него
  // и вовсе скрыта (см. VisibilityTabs isGuest), дефолт "private" был бы
  // тупиком: пустой список без объяснения, почему он пуст.
  const [activeVisibility, setActiveVisibility] = useState<VisibilityValue>(user ? "private" : "public")
  const [activeLabId, setActiveLabId] = useState<number | null>(null)
  const [modal, setModal] = useState<null | "create" | any>(null)
  const [hov, setHov] = useState<number | null>(null)
  const accent = typeColor.task
  const activeStatuses = Object.keys(statusFilter).filter(k => statusFilter[k])
  const preVisibility = data.filter((t: any) => {
    if (taskSearch.trim() && !t.name?.toLowerCase().includes(taskSearch.toLowerCase())) return false
    if (activeStatuses.length > 0 && !activeStatuses.includes(t.status)) return false
    return true
  })
  const visibilityCounts = {
    private: preVisibility.filter((t: any) => matchesVisibilityFilter(t, ["private"])).length,
    lab: preVisibility.filter((t: any) => matchesVisibilityFilter(t, ["lab"])).length,
    public: preVisibility.filter((t: any) => matchesVisibilityFilter(t, ["public"])).length,
  }
  const filtered = preVisibility.filter((t: any) => {
    if (!matchesVisibilityFilter(t, [activeVisibility])) return false
    if (activeLabId && t.lab_id !== activeLabId) return false
    return true
  })
  const { page, setPage, pageCount, paged, pageSize } = usePagination(filtered)
  const listTr = useListContentTranslation("task", paged, ["name"], (t: any) => isOwner(user, t))

  const isMobile = useIsMobile()
  const { selectEntity, clearSelection } = useEntityUrlSync(data as any[], selected, setSelected, (idOrSlug) => taskApi.get(idOrSlug), isMobile, () => filtered)

  const create = useMutation({
    mutationFn: ({ _links, _images, ...body }: any) => taskApi.create(body),
    onSuccess: async (nt: any, variables: any) => {
      if (variables._links?.length) await createLinksFor("task", nt.id, variables._links)
      if (variables._images?.length) await uploadImagesFor("task", nt.id, variables._images)
      qc.invalidateQueries({ queryKey: ["tasks"] }); setModal(null); setSelected(nt)
    },
  })
  const update = useMutation({ mutationFn: ({ id, d }: any) => taskApi.update(id, d), onSuccess: () => { qc.invalidateQueries({ queryKey: ["tasks"] }); setModal(null) } })
  const remove = useMutation({ mutationFn: taskApi.delete, onSuccess: () => { qc.invalidateQueries({ queryKey: ["tasks"] }); setSelected(null) } })

  return (
    <PageShell>
      <Header titleKey="page.tasks.title" actions={
        user ? (
          <Button variant="primary" size="sm" onClick={() => setModal("create")} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Plus size={13} /> {tr("actions.createTaskAction")}
          </Button>
        ) : undefined
      } />
      <PageContent overflow="visible" noPadding>
        <div style={SPLIT_BODY_STYLE}>
        {isLoading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {[...Array(4)].map((_, i) => <div key={i} style={{ height: 56, borderRadius: 10, background: "#111", border: "1px solid #1a1a1a", opacity: 0.5 - i * 0.1 }} />)}
          </div>
        ) : (
          <ResizableLayout
            accent={accent}
            backLabel={tr("tasks.backLabel")}
            showRight={!!selected}
            onBack={() => setSelected(null)}
            left={
              <div style={{ width: "100%", height: "100%", background: theme.bg1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                <PaginationBar total={filtered.length} page={page} pageSize={pageSize} pageCount={pageCount} onPageChange={setPage} />
                <div style={sectionSearchWrap()}>
                  <Search size={13} style={{ position: "absolute", left: 22, top: "50%", transform: "translateY(-50%)", color: "#848cb0", pointerEvents: "none" }} />
                  <input value={taskSearch} onChange={e => { setTaskSearch(e.target.value); setPage(0) }}
                    placeholder={tr("tasks.searchPlaceholder")}
                    style={sectionSearch(accent)}
                    onFocus={e => (e.target as HTMLInputElement).style.borderColor = `40`}
                    onBlur={e => (e.target as HTMLInputElement).style.borderColor = "#1e1e2a"} />
                </div>
                <VisibilityTabs
                  active={activeVisibility}
                  isGuest={!user}
                  onChange={v => { setActiveVisibility(v); setPage(0); clearSelection() }}
                  counts={visibilityCounts}
                  labs={labs}
                  activeLabId={activeLabId}
                  onLabChange={id => { setActiveLabId(id); setPage(0) }}
                />
                <ListFilters
                  statuses={STATUSES}
                  activeStatuses={statusFilter}
                  onToggleStatus={s => { setStatusFilter(p => ({ ...p, [s]: !p[s] })); setPage(0) }}
                  accent={accent}
                  showVisibility={false}
                />
                <div style={{ overflowY: "auto", flex: 1, minHeight: 0 }}>
                  {paged.map((t: any) => {
                    const isActive = selected?.id === t.id
                    const isHov = hov === t.id
                    return (
                      <EntityListItem
                        key={t.id}
                        id={t.id}
                        isActive={isActive}
                        accent={accent}
                        onClick={() => selectEntity(t)}
                        date={t.created_at}
                        title={listTr(t, "name", t.name)}
                        status={t.status}
                        onEdit={isOwner(user, t) ? () => setModal(t) : undefined}
                        onDelete={isOwner(user, t) ? () => remove.mutate(t.id) : undefined}
                        progressBar={<PercentBar label={tr("tasks.progressLabel")} value={t.progress ?? 0} color={accent} />}
                        deleteConfirmText={buildTrashConfirmText(tr, "task", t)}
                      />
                    )
                  })}
                  {data.length === 0 && (
                    <div style={{ textAlign: "center", padding: "60px 0", color: "#8a8a93", fontSize: 13 }}>Нет задач</div>
                  )}
                </div>
              </div>
            }
            right={selected ? (
              <DetailPanel accent={accent} noTopBorder>
                <TaskDetail key={selected.id} task={selected} allHyps={allHyps} onEdit={isOwner(user, selected) ? () => setModal(selected) : undefined} />
              </DetailPanel>
            ) : (
              <DetailPanelEmpty accent={accent} />
            )}
          />
        )}
        </div>
      </PageContent>

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal === "create" ? tr("tasks.createTitle") : tr("tasks.editTitle")} size="md">
        <TaskForm initial={modal !== "create" ? modal : undefined} labs={labs}
          onSave={(d: any) => modal === "create" ? create.mutate(d) : update.mutate({ id: modal.id, d })}
          onCancel={() => setModal(null)} />
      </Modal>
    </PageShell>
  )
}

export default function TasksPage() {
  return (
    <Suspense>
      <TasksPageInner />
    </Suspense>
  )
}
