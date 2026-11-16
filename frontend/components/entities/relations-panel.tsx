"use client"
import { useState, useRef, useEffect, useCallback } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useRemoveLinkWithUndo } from "@/lib/use-remove-link"
import { useIsMobile } from "@/components/layout/resizable-layout"
import { typeColor, mono } from "@/lib/theme"
import { useTypeRu } from "@/lib/i18n/useTypeRu"
import { useT } from "@/lib/i18n/useT"
import { useStore } from "@/lib/store"
import { useTranslatedRelated } from "@/lib/i18n/use-translated-query"
import { useContentT } from "@/lib/i18n/useContentT"
import { ForceGraph, type ForceGraphNode, type ForceGraphEdge } from "@/components/graph/force-graph"
import { buildLocalGraphData } from "@/lib/graph-data"
import { mentionAwareDash, mentionAwareColor, legendSwatchStyle, MENTION_EDGE_COLOR, MENTION_LEGEND_KEY } from "@/lib/graph-mention"
import { EntityPreviewModal } from "@/components/entities/entity-preview-modal"
import { EDGE_LEGEND } from "@/lib/graph-visuals"
import { influenceLegendFor } from "@/lib/worldview-influence"
import { StatusBadge } from "@/components/ui/status-badge"
import { ActionButton } from "@/components/ui/action-button"
import { SquareIconButton } from "@/components/ui/square-icon-button"
import { Plus, X, ExternalLink, Search, Maximize2, Minimize2, Link2 } from "lucide-react"
import Link from "next/link"
import { AddRelatedButton } from "@/components/entities/add-related-button"
import { RelationManager } from "@/components/entities/relation-manager"
import { getLinkTypes } from "@/components/entities/link-types"
import { QuickAddObservationModal } from "@/components/entities/quick-add-observation-modal"
import { QuickAddHypothesisModal } from "@/components/entities/quick-add-hypothesis-modal"
import { QuickAddPredictionLinkModal } from "@/components/entities/quick-add-prediction-link-modal"
import { AddForecastModal } from "@/components/entities/add-forecast-modal"
import { LinkModal } from "@/components/entities/link-modal"

function getRelationCols(t: (key: string) => string, items: any[]) {
  return [
    { label: t("relationCols.confirming"), color: "#2ECC71", items: items.filter(o => o.link_type === "подтверждает") },
    { label: t("relationCols.refuting"),   color: "#E74C3C", items: items.filter(o => o.link_type === "опровергает") },
    { label: t("relationCols.related"),    color: "#4A90D9", items: items.filter(o => !["подтверждает","опровергает"].includes(o.link_type)) },
  ]
}

// ── Link Modal ─────────────────────────────────────────────────────────────
// ── ObsCard ────────────────────────────────────────────────────────────────
function ObsCard({ item, onRemove, canRemove }: { item: any; onRemove?: () => void; canRemove?: boolean }) {
  const [hov, setHov] = useState(false)
  const isMobile = useIsMobile()
  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ background: "#0d0d16", border: `1px solid ${hov ? "#2a2a3e" : "#18182a"}`, borderRadius: 8, padding: "8px 10px", position: "relative", transition: "all 0.12s" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 6 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {item.date && <div style={{ ...mono("#404060", 10), marginBottom: 3 }}>{item.date}</div>}
          <Link href={`/observations?id=${item.id}&tab=detail`} style={{ textDecoration: "none" }}>
            <div style={{ fontSize: 12, color: hov ? "#e0e0f0" : "#9090b8", lineHeight: 1.4, transition: "color 0.12s" }}>{item.title}</div>
          </Link>
        </div>
        <div style={{ display: "flex", gap: 2, opacity: (isMobile || hov) ? 1 : 0, transition: "opacity 0.12s" }}>
          <Link href={`/observations?id=${item.id}&tab=detail`} style={{ padding: "2px 4px", color: "#9696a7", display: "flex" }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = "#9393bc")}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = "#9696a8")}>
            <ExternalLink size={10} />
          </Link>
          {canRemove && onRemove && (
            <button onClick={onRemove} style={{ padding: "2px 4px", border: "none", background: "none", color: "#9696a7", cursor: "pointer", display: "flex" }}
              onMouseEnter={e => (e.currentTarget.style.color = "#E74C3C")}
              onMouseLeave={e => (e.currentTarget.style.color = "#9696a8")}>
              <X size={10} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── ObservationsTab ────────────────────────────────────────────────────────
export function ObservationsTab({ entityType, entityId, entityName }: { entityType: string; entityId: number; entityName?: string }) {
  const t = useT()
  const user = useStore(s => s.user)
  const qc = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [quickCreateOpen, setQuickCreateOpen] = useState(false)

  const { data, isLoading } = useTranslatedRelated(entityType, entityId)

  const removeLink = useRemoveLinkWithUndo(entityType, entityId)

  const allObs: any[] = data?.related?.observation ?? []
  const cols = getRelationCols(t, allObs)

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, paddingBottom: 32 }}>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <AddRelatedButton
          triggerLabel={t("actions.addObservationTrigger")}
          createLabel={t("actions.addObservation")}
          linkLabel={t("relations.addObservation")}
          onCreateSelect={() => setQuickCreateOpen(true)}
          onLinkSelect={() => setShowModal(true)}
          isGuest={!user}
        />
      </div>
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {[...Array(3)].map((_, i) => <div key={i} style={{ height: 120, borderRadius: 8, background: "#0d0d16" }} />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {cols.map(col => (
            <div key={col.label}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: col.color }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: col.color + "cc", letterSpacing: "0.08em", textTransform: "uppercase" }}>{col.label}</span>
                {col.items.length > 0 && <span style={{ fontSize: 12, color: "#9696a6", marginLeft: 2 }}>({col.items.length})</span>}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {col.items.map(item => (
                  <ObsCard key={item.id} item={item} canRemove onRemove={() => removeLink.mutate({ toType: "observation", toId: item.id })} />
                ))}
                {col.items.length === 0 && <div style={{ padding: "16px 0", textAlign: "center", color: "#9999a2", fontSize: 12 }}>—</div>}
              </div>
            </div>
          ))}
        </div>
      )}
      {showModal && <LinkModal entityType={entityType} entityId={entityId} onClose={() => setShowModal(false)} onlyType="observation" />}
      {entityName && (
        <QuickAddObservationModal
          open={quickCreateOpen}
          onClose={() => setQuickCreateOpen(false)}
          targetType={entityType}
          targetId={entityId}
          targetLabel={entityName}
          onCreated={() => qc.invalidateQueries({ queryKey: ["related", entityType, entityId] })}
        />
      )}
    </div>
  )
}

// ── Local Graph Panel ──────────────────────────────────────────────────────

const FULLSCREEN_MS = 360

interface FullscreenState {
  /** расстояния от краёв окна до встроенного графа: оттуда «раскрывается» полный экран */
  from: { top: number; right: number; bottom: number; left: number }
  shown: boolean
  reduced: boolean
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

/** Два кадра: первый фиксирует начальный вид, второй запускает переход (иначе браузер схлопнет их в один). */
function nextFrame(cb: () => void) {
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => requestAnimationFrame(cb))
  else setTimeout(cb, 32)
}

function overlayStyle(o: FullscreenState): React.CSSProperties {
  const { top, right, bottom, left } = o.from
  return {
    position: "fixed", inset: 0, zIndex: 300, background: "#06060f", display: "flex", flexDirection: "column",
    clipPath: o.shown ? "inset(0px 0px 0px 0px round 0px)" : `inset(${top}px ${right}px ${bottom}px ${left}px round 12px)`,
    transition: o.reduced ? "none" : `clip-path ${FULLSCREEN_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`,
    willChange: "clip-path",
  }
}

export function LocalGraphPanel({ entityType, entityId, entityTitle, bare = false, height = 240, onFitReady, compact = false }: {
  entityType: string; entityId: number; entityTitle?: string
  /** без заголовка и внешних отступов: для встраивания в блок «Что уже известно» */
  bare?: boolean
  height?: number
  /**
   * Владелец блока сам рисует «Показать весь граф» (в своей шапке) и получает действие через этот колбэк;
   * тогда на холсте остаётся только «Развернуть граф». Без колбэка: родная кнопка масштаба на холсте,
   * «Развернуть граф» под легендой.
   */
  onFitReady?: (fit: (() => void) | null) => void
  /** тесное место (узкий блок, телефон): «Развернуть граф» на холсте — квадратная кнопка без текста */
  compact?: boolean
}) {
  const t = useT()
  const canvasRef = useRef<HTMLDivElement>(null)
  const [overlay, setOverlay] = useState<FullscreenState | null>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const seq = useRef(0)
  const fitOutside = !!onFitReady

  const clearCloseTimer = useCallback(() => {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null }
  }, [])
  const openFullscreen = useCallback(() => {
    clearCloseTimer()
    const my = ++seq.current
    const r = canvasRef.current?.getBoundingClientRect()
    const reduced = prefersReducedMotion()
    const from = r
      ? { top: r.top, right: window.innerWidth - r.right, bottom: window.innerHeight - r.bottom, left: r.left }
      : { top: 0, right: 0, bottom: 0, left: 0 }
    setOverlay({ from, shown: reduced, reduced })
    if (!reduced) nextFrame(() => { if (seq.current === my) setOverlay(o => (o ? { ...o, shown: true } : o)) })
  }, [clearCloseTimer])
  const closeFullscreen = useCallback(() => {
    seq.current++
    clearCloseTimer()
    setOverlay(o => (o ? { ...o, shown: false } : o))
    closeTimer.current = setTimeout(() => setOverlay(null), prefersReducedMotion() ? 0 : FULLSCREEN_MS)
  }, [clearCloseTimer])
  useEffect(() => clearCloseTimer, [clearCloseTimer])
  const isOpen = overlay !== null
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeFullscreen() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [isOpen, closeFullscreen])
  const [selectedNode, setSelectedNode] = useState<ForceGraphNode | null>(null)

  const { data } = useTranslatedRelated(entityType, entityId)

  const mentionsData = data?.mentions as { mentions?: unknown[]; mentioned_in?: unknown[] } | undefined
  const linkCount = Object.values(data?.related || {}).flat().length
  const mentionCount = (mentionsData?.mentions?.length ?? 0) + (mentionsData?.mentioned_in?.length ?? 0)
  const total = linkCount + mentionCount
  if (!data || total === 0) return null
  const plural = linkCount === 1 ? t("relations.pluralOne") : linkCount < 5 ? t("relations.pluralFew") : t("relations.pluralMany")

  const { nodes, edges } = buildLocalGraphData(data, entityType, entityId, entityTitle)
  const hasMentionEdges = edges.some(e => e.mention)
  const legend: [string, string][] = [...EDGE_LEGEND, ...influenceLegendFor(edges), ...(hasMentionEdges ? [[MENTION_EDGE_COLOR, MENTION_LEGEND_KEY] as [string, string]] : [])]


  return (
    <>
      <div style={bare ? undefined : { marginBottom: 24 }}>
        {!bare && (<div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#9898bb", letterSpacing: "0.1em", textTransform: "uppercase" }}>{t("relations.localGraph")}</span>
          {linkCount > 0 && <span style={{ fontSize: 12, color: "#9999ad" }}>· {linkCount} {plural}</span>}
        </div>)}
        <div ref={canvasRef} style={{ background: "#05050a", border: "1px solid #12121e", borderRadius: 12, overflow: "hidden", position: "relative", height }}>
          <ForceGraph
            nodes={nodes}
            edges={edges}
            fixedCenter
            hideFitButton={fitOutside}
            onFitReady={onFitReady}
            colorForEdge={mentionAwareColor}
            dashForEdge={mentionAwareDash}
            onNodeClick={n => { if (!n.isCenter) setSelectedNode(n) }}
          />
          {fitOutside && (
            <div style={{ position: "absolute", top: 12, right: 12, zIndex: 5 }}>
              {compact
                ? <SquareIconButton label={t("relations.expandGraph")} icon={<Maximize2 size={16} />} onClick={() => openFullscreen()} />
                : <ActionButton size="sm" icon={<Maximize2 size={14} />} onClick={() => openFullscreen()}>{t("relations.expandGraph")}</ActionButton>}
            </div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", paddingLeft: 2 }}>
          {legend.map(([c, labelKey]) => (
            <div key={labelKey} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ ...legendSwatchStyle(c, labelKey, 16), opacity: 0.8 }} />
              <span style={{ fontSize: 12, color: "#9898bb" }}>{t(labelKey)}</span>
            </div>
          ))}
          </div>
          {!fitOutside && (
            <ActionButton size="sm" icon={<Maximize2 size={14} />} onClick={() => openFullscreen()}>{t("relations.expandGraph")}</ActionButton>
          )}
        </div>
      </div>

      {overlay && (
        <div role="dialog" aria-modal="true" aria-label={t("relations.graphOfLinks")} style={overlayStyle(overlay)}>
          {/* header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px", borderBottom: "1px solid #0e0e1a", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#9090c0", letterSpacing: "0.1em", textTransform: "uppercase" }}>{t("relations.graphOfLinks")}</span>
              <span style={{ fontSize: 12, color: "#9696aa" }}>· {entityTitle}</span>
              <span style={{ fontSize: 12, color: "#9696a6", marginLeft: 4 }}>· {t("relations.graphHint")}</span>
            </div>
            <button onClick={() => closeFullscreen()} title={t("relations.collapseGraph")}
              style={{ width: 36, height: 36, borderRadius: 9, background: "#0d0d18", border: "1px solid #2a2a40", color: "#9090c0", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 12px rgba(0,0,0,0.5)", transition: "all 0.15s" }}
              onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = "#1a1a2e"; el.style.borderColor = "#4A90D9"; el.style.color = "#4A90D9" }}
              onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background = "#0d0d18"; el.style.borderColor = "#2a2a40"; el.style.color = "#9090c0" }}>
              <Minimize2 size={15} />
            </button>
          </div>

          {/* body: graph */}
          <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <ForceGraph
                nodes={nodes}
                edges={edges}
                fixedCenter
                colorForEdge={mentionAwareColor}
                dashForEdge={mentionAwareDash}
                onNodeClick={n => { if (!n.isCenter) setSelectedNode(n) }}
              />
            </div>
          </div>

          {/* legend */}
          <div style={{ display: "flex", gap: 20, padding: "10px 20px", borderTop: "1px solid #0e0e1a", justifyContent: "center", flexShrink: 0 }}>
            {legend.map(([c, labelKey]) => (
              <div key={labelKey} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={legendSwatchStyle(c, labelKey, 20)} />
                <span style={{ fontSize: 12, color: "#9393bc" }}>{t(labelKey)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {selectedNode && (
        <EntityPreviewModal type={selectedNode.type} id={selectedNode.entityId} onClose={() => setSelectedNode(null)} openRecord />
      )}
    </>
  )
}


// ── Relations Panel ────────────────────────────────────────────────────────
export function RelationsPanel({ entityType, entityId }: { entityType: string; entityId: number }) {
  return <RelationManager entityType={entityType} entityId={entityId} />
}

// ── HypCard ────────────────────────────────────────────────────────────────
function HypCard({ item, onRemove, canRemove }: { item: any; onRemove?: () => void; canRemove?: boolean }) {
  const [hov, setHov] = useState(false)
  const isMobile = useIsMobile()
  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ background: "#0d0d16", border: `1px solid ${hov ? "#2a2a3e" : "#18182a"}`, borderRadius: 8, padding: "8px 10px", position: "relative", transition: "all 0.12s" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 6 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {item.status && <div style={{ fontSize: 12, color: "#9696aa", marginBottom: 3, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>{item.status}</div>}
          <Link href={`/hypotheses?id=${item.id}&tab=detail`} style={{ textDecoration: "none" }}>
            <div style={{ fontSize: 12, color: hov ? "#e0e0f0" : "#9090b8", lineHeight: 1.4, transition: "color 0.12s" }}>{item.title}</div>
          </Link>
        </div>
        <div style={{ display: "flex", gap: 2, opacity: (isMobile || hov) ? 1 : 0, transition: "opacity 0.12s" }}>
          <Link href={`/hypotheses?id=${item.id}&tab=detail`} style={{ padding: "2px 4px", color: "#9696a7", display: "flex" }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = "#9393bc")}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = "#9696a8")}>
            <ExternalLink size={10} />
          </Link>
          {canRemove && onRemove && (
            <button onClick={onRemove} style={{ padding: "2px 4px", border: "none", background: "none", color: "#9696a7", cursor: "pointer", display: "flex" }}
              onMouseEnter={e => (e.currentTarget.style.color = "#E74C3C")}
              onMouseLeave={e => (e.currentTarget.style.color = "#9696a8")}>
              <X size={10} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── HypothesesTab ──────────────────────────────────────────────────────────
export function HypothesesTab({ entityType, entityId, entityName }: { entityType: string; entityId: number; entityName?: string }) {
  const t = useT()
  const user = useStore(s => s.user)
  const qc = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [quickCreateOpen, setQuickCreateOpen] = useState(false)

  const { data, isLoading } = useTranslatedRelated(entityType, entityId)

  const removeLink = useRemoveLinkWithUndo(entityType, entityId)

  const allHyp: any[] = data?.related?.hypothesis ?? []
  const cols = getRelationCols(t, allHyp)

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, paddingBottom: 32 }}>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <AddRelatedButton
          triggerLabel={t("actions.addHypothesis")}
          createLabel={t("actions.addHypothesis")}
          linkLabel={t("relations.addHypothesis")}
          isGuest={!user}
          onCreateSelect={() => setQuickCreateOpen(true)}
          onLinkSelect={() => setShowModal(true)}
        />
      </div>
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {[...Array(3)].map((_, i) => <div key={i} style={{ height: 120, borderRadius: 8, background: "#0d0d16" }} />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {cols.map(col => (
            <div key={col.label}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: col.color }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: col.color + "cc", letterSpacing: "0.08em", textTransform: "uppercase" }}>{col.label}</span>
                {col.items.length > 0 && <span style={{ fontSize: 12, color: "#9696a6", marginLeft: 2 }}>({col.items.length})</span>}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {col.items.map(item => (
                  <HypCard key={item.id} item={item} canRemove onRemove={() => removeLink.mutate({ toType: "hypothesis", toId: item.id })} />
                ))}
                {col.items.length === 0 && <div style={{ padding: "16px 0", textAlign: "center", color: "#9999a2", fontSize: 12 }}>—</div>}
              </div>
            </div>
          ))}
        </div>
      )}
      {showModal && <LinkModal entityType={entityType} entityId={entityId} onClose={() => setShowModal(false)} onlyType="hypothesis" />}
      {entityName && (
        <QuickAddHypothesisModal
          open={quickCreateOpen}
          onClose={() => setQuickCreateOpen(false)}
          targetType={entityType}
          targetId={entityId}
          targetLabel={entityName}
          onCreated={() => qc.invalidateQueries({ queryKey: ["related", entityType, entityId] })}
        />
      )}
    </div>
  )
}




// ── PredCard ───────────────────────────────────────────────────────────────
function PredCard({ item, onRemove, canRemove }: { item: any; onRemove?: () => void; canRemove?: boolean }) {
  const [hov, setHov] = useState(false)
  const isMobile = useIsMobile()
  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ background: "#0d0d16", border: `1px solid ${hov ? "#2a2a3e" : "#18182a"}`, borderRadius: 8, padding: "8px 10px", transition: "all 0.12s" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 6 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {item.status && <div style={{ fontSize: 12, color: "#9696aa", marginBottom: 3, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>{item.status}</div>}
          <Link href={`/predictions?id=${item.id}&tab=detail`} style={{ textDecoration: "none" }}>
            <div style={{ fontSize: 12, color: hov ? "#e0e0f0" : "#9090b8", lineHeight: 1.4, transition: "color 0.12s" }}>{item.title}</div>
          </Link>
        </div>
        <div style={{ display: "flex", gap: 2, opacity: (isMobile || hov) ? 1 : 0, transition: "opacity 0.12s" }}>
          <Link href={`/predictions?id=${item.id}&tab=detail`} style={{ padding: "2px 4px", color: "#9696a7", display: "flex" }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = "#9393bc")}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = "#9696a8")}>
            <ExternalLink size={10} />
          </Link>
          {canRemove && onRemove && (
            <button onClick={onRemove} style={{ padding: "2px 4px", border: "none", background: "none", color: "#9696a7", cursor: "pointer", display: "flex" }}
              onMouseEnter={e => (e.currentTarget.style.color = "#E74C3C")}
              onMouseLeave={e => (e.currentTarget.style.color = "#9696a8")}>
              <X size={10} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── PredictionsTab ─────────────────────────────────────────────────────────
export function PredictionsTab({ entityType, entityId, entityName }: { entityType: string; entityId: number; entityName?: string }) {
  const t = useT()
  const user = useStore(s => s.user)
  const qc = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [quickCreateOpen, setQuickCreateOpen] = useState(false)
  // прогноз, привязанный к гипотезе, должен получить жёсткий FK hypothesis_id
  // (используется в hypothesis_evidence.py) — для этого случая переиспользуем
  // AddForecastModal, а не generic-Link форму
  const isHypothesisParent = entityType === "hypothesis"

  const { data, isLoading } = useTranslatedRelated(entityType, entityId)

  const removeLink = useRemoveLinkWithUndo(entityType, entityId)

  const allPred: any[] = data?.related?.prediction ?? []
  const cols = getRelationCols(t, allPred)

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, paddingBottom: 32 }}>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <AddRelatedButton
          triggerLabel={t("actions.addPrediction")}
          createLabel={t("actions.addPrediction")}
          linkLabel={t("relations.addPrediction")}
          isGuest={!user}
          onCreateSelect={() => setQuickCreateOpen(true)}
          onLinkSelect={() => setShowModal(true)}
        />
      </div>
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {[...Array(3)].map((_, i) => <div key={i} style={{ height: 120, borderRadius: 8, background: "#0d0d16" }} />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {cols.map(col => (
            <div key={col.label}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: col.color }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: col.color + "cc", letterSpacing: "0.08em", textTransform: "uppercase" }}>{col.label}</span>
                {col.items.length > 0 && <span style={{ fontSize: 12, color: "#9696a6", marginLeft: 2 }}>({col.items.length})</span>}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {col.items.map(item => (
                  <PredCard key={item.id} item={item} canRemove onRemove={() => removeLink.mutate({ toType: "prediction", toId: item.id })} />
                ))}
                {col.items.length === 0 && <div style={{ padding: "16px 0", textAlign: "center", color: "#9999a2", fontSize: 12 }}>—</div>}
              </div>
            </div>
          ))}
        </div>
      )}
      {showModal && <LinkModal entityType={entityType} entityId={entityId} onClose={() => setShowModal(false)} onlyType="prediction" />}
      {entityName && isHypothesisParent && (
        <AddForecastModal
          open={quickCreateOpen}
          onClose={() => setQuickCreateOpen(false)}
          hypothesisId={entityId}
          hypothesisName={entityName}
          onCreated={() => qc.invalidateQueries({ queryKey: ["related", entityType, entityId] })}
        />
      )}
      {entityName && !isHypothesisParent && (
        <QuickAddPredictionLinkModal
          open={quickCreateOpen}
          onClose={() => setQuickCreateOpen(false)}
          targetType={entityType}
          targetId={entityId}
          targetLabel={entityName}
          onCreated={() => qc.invalidateQueries({ queryKey: ["related", entityType, entityId] })}
        />
      )}
    </div>
  )
}
